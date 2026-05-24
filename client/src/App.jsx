import { useState, useCallback, useRef } from 'react'
import { useCamera } from './hooks/useCamera.js'
import { useBlinkDetection } from './hooks/useBlinkDetection.js'
import { useSocket } from './hooks/useSocket.js'

import NavRail from './components/ui/NavRail.jsx'
import Lobby from './components/screens/Lobby.jsx'
import Matchmaking from './components/screens/Matchmaking.jsx'
import PreMatch from './components/screens/PreMatch.jsx'
import LiveMatch from './components/screens/LiveMatch.jsx'
import Result from './components/screens/Result.jsx'
import Leaderboard from './components/screens/Leaderboard.jsx'

const SCREEN = {
  LOBBY:        'lobby',
  MATCHMAKING:  'matchmaking',
  PREMATCH:     'prematch',
  MATCH:        'match',
  RESULT:       'result',
  LEADERBOARD:  'leaderboard',
}

const PLAYER_NAME = `Player_${Math.random().toString(36).slice(2, 6).toUpperCase()}`

export default function App() {
  const [screen, setScreen]     = useState(SCREEN.LOBBY)
  const [matchData, setMatchData] = useState(null)   // from MATCH_FOUND
  const [resultData, setResultData] = useState(null) // from MATCH_END
  const [stats, setStats] = useState({ wins: 0, losses: 0, streak: 0, bestHold: 0 })
  const [blinkActive, setBlinkActive] = useState(false)

  const camera = useCamera()

  // ── Socket callbacks ──────────────────────────────────────
  const handleMatchFound = useCallback((data) => {
    setMatchData(data)
    setScreen(SCREEN.PREMATCH)
  }, [])

  const handleBlinkDetected = useCallback(() => {
    // Server confirms blink; visual feedback handled in LiveMatch
  }, [])

  const handleMatchEnd = useCallback((data) => {
    setBlinkActive(false)
    const isWin = data.winner === matchData?.myPlayerId
    setResultData({ ...data, myPlayerId: matchData?.myPlayerId, opponentName: matchData?.opponentName, isWin })
    setScreen(SCREEN.RESULT)
    setStats(prev => ({
      wins:     isWin ? prev.wins + 1 : prev.wins,
      losses:   isWin ? prev.losses : prev.losses + 1,
      streak:   isWin ? prev.streak + 1 : 0,
      bestHold: isWin ? Math.max(prev.bestHold, data.blinkTimestamp) : prev.bestHold,
    }))
  }, [matchData])

  const { connected, joinQueue, leaveQueue, sendEAR, forfeit } = useSocket({
    onMatchFound:    handleMatchFound,
    onBlinkDetected: handleBlinkDetected,
    onMatchEnd:      handleMatchEnd,
  })

  // ── Blink detection ───────────────────────────────────────
  const handleBlink = useCallback(() => {
    // Client-side blink detected; server will confirm via MATCH_END
  }, [])

  const handleEARUpdate = useCallback((ear) => {
    if (matchData?.matchId) sendEAR(matchData.matchId, ear)
  }, [matchData, sendEAR])

  const blink = useBlinkDetection({
    videoRef: camera.videoRef,
    enabled: blinkActive,
    onBlink: handleBlink,
    onEARUpdate: handleEARUpdate,
  })

  // ── Flow handlers ─────────────────────────────────────────
  function handleFindOpponent() {
    joinQueue(PLAYER_NAME)
    setScreen(SCREEN.MATCHMAKING)
  }

  function handleCancelQueue() {
    leaveQueue()
    setScreen(SCREEN.LOBBY)
  }

  function handleMatchStart() {
    setBlinkActive(true)
    setScreen(SCREEN.MATCH)
  }

  function handleRematch() {
    joinQueue(PLAYER_NAME)
    setScreen(SCREEN.MATCHMAKING)
  }

  function handleReturnToQueue() {
    setResultData(null)
    setMatchData(null)
    setScreen(SCREEN.LOBBY)
  }

  function handleForfeit() {
    if (matchData?.matchId) forfeit(matchData.matchId, 'user')
    setBlinkActive(false)
    setScreen(SCREEN.LOBBY)
  }

  function handleNavigate(target) {
    // Block nav during active match or countdown
    if (screen === SCREEN.MATCH || screen === SCREEN.PREMATCH) return
    if (target === 'lobby') {
      setScreen(SCREEN.LOBBY)
    } else if (target === 'leaderboard') {
      setScreen(SCREEN.LEADERBOARD)
    }
  }

  // ── Render ────────────────────────────────────────────────
  const showNav = screen !== SCREEN.MATCH

  return (
    <div className="app-shell">
      {showNav && (
        <NavRail
          screen={screen === SCREEN.MATCHMAKING ? 'lobby' : screen}
          onNavigate={handleNavigate}
          connected={connected}
        />
      )}

      <main className="app-main">
        {screen === SCREEN.LOBBY && (
          <Lobby
            playerName={PLAYER_NAME}
            stats={stats}
            camera={camera}
            blink={blink}
            connected={connected}
            onFindOpponent={handleFindOpponent}
          />
        )}

        {screen === SCREEN.MATCHMAKING && (
          <Matchmaking
            playerName={PLAYER_NAME}
            onCancel={handleCancelQueue}
          />
        )}

        {screen === SCREEN.PREMATCH && (
          <PreMatch
            camera={camera}
            blink={blink}
            matchData={matchData}
            playerName={PLAYER_NAME}
            onMatchStart={handleMatchStart}
            onCancel={handleForfeit}
          />
        )}

        {screen === SCREEN.MATCH && (
          <LiveMatch
            camera={camera}
            blink={blink}
            matchData={matchData}
            playerName={PLAYER_NAME}
            sendEAR={sendEAR}
          />
        )}

        {screen === SCREEN.RESULT && (
          <Result
            resultData={resultData}
            playerName={PLAYER_NAME}
            stats={stats}
            onRematch={handleRematch}
            onReturnToQueue={handleReturnToQueue}
          />
        )}

        {screen === SCREEN.LEADERBOARD && (
          <Leaderboard playerName={PLAYER_NAME} />
        )}
      </main>
    </div>
  )
}
