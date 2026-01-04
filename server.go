package main

import (
	"encoding/json"
	"github.com/gorilla/websocket"
	"log"
	"math/rand"
	"net/http"
	"sync"
)

type Player struct {
	ID       string  `json:"id"`
	Session  string  `json:"session"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Angle    float64 `json:"angle"`
	HP       float64 `json:"hp"`
	MaxHP    float64 `json:"maxHp"`
	Level    int     `json:"level"`
	XP       float64 `json:"xp"`
	XPToNext float64 `json:"xpToNextLevel"`
}

type Bullet struct {
	ID      string  `json:"id"`
	Session string  `json:"session"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Vx      float64 `json:"vx"`
	Vy      float64 `json:"vy"`
	Dist    float64 `json:"dist"`
	Owner   string  `json:"owner"`
}

type XPItem struct {
	ID    string  `json:"id"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Value int     `json:"value"`
}

type XPArea struct {
	ID           string  `json:"id"`
	X            float64 `json:"x"`
	Y            float64 `json:"y"`
	Width        float64 `json:"width"`
	Height       float64 `json:"height"`
	XpPerSecond  float64 `json:"xpPerSecond"`
	Active       bool    `json:"active"`
	TimeInArea   float64 `json:"timeInArea"`
	MaxTime      float64 `json:"maxTime"`
	ActionRadius float64 `json:"actionRadius"`
}

type Session struct {
	ID          string             `json:"id"`
	Players     map[string]*Player `json:"players"`
	Bullets     map[string]*Bullet `json:"bullets"`
	XPItems     map[string]*XPItem `json:"xpItems"`
	XPAreas     map[string]*XPArea `json:"xpAreas"`
	WorldWidth  float64            `json:"worldWidth"`
	WorldHeight float64            `json:"worldHeight"`
	Mutex       sync.RWMutex
}

var (
	clients  = make(map[*websocket.Conn]string)
	sessions = make(map[string]*Session)
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
)

func wsHandler(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session")
	if sessionID == "" {
		sessionID = randString(8)
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("Upgrade error:", err)
		return
	}
	defer conn.Close()

	// Найти или создать сессию
	var session *Session
	if s, ok := sessions[sessionID]; ok {
		session = s
	} else {
		// В создании новой сессии:
		session = &Session{
			ID:          sessionID,
			Players:     make(map[string]*Player),
			Bullets:     make(map[string]*Bullet),
			XPItems:     make(map[string]*XPItem),
			XPAreas:     make(map[string]*XPArea), // <= Добавьте
			WorldWidth:  2000,
			WorldHeight: 2000,
		}

		// Генерируем XPItems
		for i := 0; i < 20; i++ {
			session.XPItems[randString(6)] = &XPItem{
				ID:    randString(6),
				X:     rand.Float64() * 2000,
				Y:     rand.Float64() * 2000,
				Value: 20 + rand.Intn(61),
			}
		}

		// Генерируем XPAreas
		for i := 0; i < 3; i++ { // Например, 3 зоны
			session.XPAreas[randString(6)] = &XPArea{
				ID:           randString(6),
				X:            rand.Float64() * 2000,
				Y:            rand.Float64() * 2000,
				Width:        60,
				Height:       60,
				XpPerSecond:  5,
				Active:       false,
				TimeInArea:   0,
				MaxTime:      5,
				ActionRadius: 90,
			}
		}
		sessions[sessionID] = session
	}

	session.Mutex.Lock()

	id := randString(8)
	player := &Player{
		ID:       id,
		Session:  sessionID,
		X:        rand.Float64() * session.WorldWidth,
		Y:        rand.Float64() * session.WorldHeight,
		Angle:    0,
		HP:       100,
		MaxHP:    100,
		Level:    0,
		XP:       0,
		XPToNext: 100,
	}

	session.Players[id] = player
	clients[conn] = id

	session.Mutex.Unlock()

	conn.WriteJSON(map[string]interface{}{"type": "id", "id": id, "session": sessionID})

	// Отправляем состояние сессии
	session.Mutex.RLock()
	conn.WriteJSON(map[string]interface{}{
		"type":    "sessionState",
		"session": session, // <= Отправляем весь объект
	})
	session.Mutex.RUnlock()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Client %s disconnected", id)
			session.Mutex.Lock()
			delete(clients, conn)
			delete(session.Players, id)
			session.Mutex.Unlock()
			break
		}

		var data map[string]interface{}
		err = json.Unmarshal(msg, &data)
		if err != nil {
			continue
		}

		session.Mutex.Lock()

		switch data["type"] {
		case "move":
			if p, ok := session.Players[data["id"].(string)]; ok {
				p.X = data["x"].(float64)
				p.Y = data["y"].(float64)
				p.Angle = data["angle"].(float64)
				// Рассылаем обновление всем
				broadcastToSession(session, msg)
			}
		case "shoot":
			bulletData := data["bullet"].(map[string]interface{})
			bullet := &Bullet{
				ID:      randString(6),
				Session: sessionID,
				X:       bulletData["x"].(float64),
				Y:       bulletData["y"].(float64),
				Vx:      bulletData["vx"].(float64),
				Vy:      bulletData["vy"].(float64),
				Dist:    0,
				Owner:   data["id"].(string),
			}
			session.Bullets[bullet.ID] = bullet
			broadcastToSession(session, msg)
		case "orbCollected":
			// Удаляем orb по ID
			delete(session.XPItems, data["id"].(string))

			// Создаем новый orb
			newID := randString(6)
			session.XPItems[newID] = &XPItem{
				ID:    newID,
				X:     rand.Float64() * session.WorldWidth,
				Y:     rand.Float64() * session.WorldHeight,
				Value: 20 + rand.Intn(61),
			}

			// Рассылаем обновление состояния всем клиентам
			broadcastToSession(session, mustJson(map[string]interface{}{
				"type":    "sessionState",
				"session": session,
			}))
		}

		session.Mutex.Unlock()

	}
}

func randString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}

func mustJson(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}

func broadcastToSession(session *Session, msg []byte) {
	for client, pid := range clients {
		if _, ok := session.Players[pid]; ok {
			err := client.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				log.Printf("Error: %v", err)
				delete(clients, client)
				client.Close()
			}
		}
	}
}

func main() {
	http.HandleFunc("/ws", wsHandler)
	http.Handle("/", http.FileServer(http.Dir("./client/")))

	log.Println("Server started on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
