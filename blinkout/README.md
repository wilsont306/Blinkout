# BlinkOut — Don't Blink. Or Lose.

Real-time multiplayer staring contest using computer vision. First player to blink loses.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| CV | MediaPipe FaceMesh (WASM) |
| Real-time | Socket.IO |
| Backend | Node.js + Fastify |

## Setup

### Server

```bash
cd server
npm install
npm run dev
```

Runs on `http://localhost:3001`.

### Client

```bash
cd client
npm install
npm run dev
```

Runs on `http://localhost:5173`.

### Environment Variables

Create `client/.env.local`:
```
VITE_SERVER_URL=http://localhost:3001
```

## How It Works

1. Both players grant camera access and enter the matchmaking queue
2. Server pairs two players and starts a 3-2-1 countdown
3. MediaPipe FaceMesh runs locally — **no video leaves the device**
4. Eye Aspect Ratio (EAR) is computed per frame and sent as a scalar to the server
5. Server detects a blink when EAR < 0.20 for 2+ consecutive frames (~66 ms)
6. First player to blink loses

## CV Specification

- **Model**: MediaPipe FaceMesh (468 landmarks)
- **Eye points (left)**: 33, 159, 160, 133, 144, 145
- **EAR formula**: `(‖p2−p6‖ + ‖p3−p5‖) / (2 × ‖p1−p4‖)`
- **Blink threshold**: EAR < 0.20 for ≥ 2 frames at 30 fps
- **Privacy**: raw frames never transmitted; only scalar EAR values sent over WebSocket

## Project Structure

```
blinkout/
├── client/          # React + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── camera/    # CameraPreview, EARBar
│       │   ├── screens/   # Lobby, Matchmaking, PreMatch, LiveMatch, Result, Leaderboard
│       │   └── ui/        # Button, NavRail, StatusPill
│       ├── hooks/         # useCamera, useBlinkDetection, useSocket
│       └── lib/           # earDetection utilities
└── server/          # Fastify + Socket.IO backend
    └── src/
        ├── socket/   # matchmaking queue, game room state machine
        └── db/       # PostgreSQL schema
```
