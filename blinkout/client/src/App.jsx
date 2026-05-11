import { useState, useCallback, useEffect, useRef } from 'react'
import { useCamera } from './hooks/useCamera.js'
import { useBlinkDetection } from './hooks/useBlinkDetection.js'
import { useGame, CLIENT_ID } from './hooks/useGame.js'
import { supabase } from './lib/supabase.js'

import Lobby from './components/screens/Lobby.jsx'
import Matchmaking from './components/screens/Matchmaking.jsx'
import PreMatch from './components/screens/PreMatch.jsx'
import LiveMatch from './components/screens/LiveMatch.jsx'
import Result from './components/screens/Result.jsx'
import PracticeMode from './components/screens/PracticeMode.jsx'
import InviteLobby from './components/screens/InviteLobby.jsx'

const SCREEN = {
  LOBBY:        'lobby',
  MATCHMAKING:  'matchmaking',
  INVITE_LOBBY: 'invite_lobby',
  PREMATCH:     'prematch',
  MATCH:        'match',
  RESULT:       'result',
  PRACTICE:     'practice',
}

function getInviteCode() {
  return new URLSearchParams(window.location.search).get('invite')
}

function getOrCreateName() {
  let name = localStorage.getItem('blinkout_name')
  if (!name) {
    name = `Player_${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    localStorage.setItem('blinkout_name', name)
  }
  return name
}

export default function App() {
  const [screen, setScreen]         = useState(() => getInviteCode() ? SCREEN.INVITE_LOBBY : SCREEN.LOBBY)
  const [inviteCode, setInviteCode] = useState(() => getInviteCode() || null)
  const [matchData, setMatchData]   = useState(null)
  const [resultData, setResultData] = useState(null)
  const [stats, setStats]           = useState({ wins: 0, losses: 0, streak: 0, bestHold: 0 })
  const [blinkActive, setBlinkActive]       = useState(false)
  const [opponentEAR, setOpponentEAR]       = useState(0.3)
  const [opponentFrame, setOpponentFrame]   = useState(null)
  const [queueMatched, setQueueMatched]     = useState(false)
  const [isLeavingLobby, setIsLeavingLobby] = useState(false)
  const [rematchStatus, setRematchStatus]   = useState(null)
  const [playerName, setPlayerName]         = useState(getOrCreateName)
  const [practiceBest, setPracticeBest]     = useState(() =>
    parseInt(localStorage.getItem('blinkout_solo_best') || '0', 10)
  )

  const playerNameRef   = useRef(playerName)
  const queueAdvanceRef = useRef(null)
  const autoForfeitRef  = useRef(false)
  const blinkSentRef    = useRef(false)
  const matchStartMsRef = useRef(null)

  useEffect(() => { playerNameRef.current = playerName }, [playerName])

  const camera = useCamera()

  // ── Game event handlers ───────────────────────────────────────
  const handleMatchFound = useCallback((data) => {
    setMatchData(data)
    setOpponentEAR(0.3)
    setOpponentFrame(null)
    setQueueMatched(true)
    setRematchStatus(null)
    if (queueAdvanceRef.current) clearTimeout(queueAdvanceRef.current)
    queueAdvanceRef.current = setTimeout(() => {
      setQueueMatched(false)
      setScreen(SCREEN.PREMATCH)
      queueAdvanceRef.current = null
    }, 2000)
  }, [])

  const handleMatchEnd = useCallback((data) => {
    setBlinkActive(false)
    setOpponentFrame(null)
    setRematchStatus(null)
    const isWin = data.winner === CLIENT_ID
    setResultData({ ...data, myPlayerId: CLIENT_ID, opponentName: matchData?.opponentName, isWin })
    setScreen(SCREEN.RESULT)
    setStats(prev => {
      const next = {
        wins:     isWin ? prev.wins + 1 : prev.wins,
        losses:   isWin ? prev.losses   : prev.losses + 1,
        streak:   isWin ? prev.streak + 1 : 0,
        bestHold: isWin ? Math.max(prev.bestHold, data.blinkTimestamp) : prev.bestHold,
      }
      if (isWin) {
        supabase.rpc('upsert_leaderboard', {
          p_handle:    playerNameRef.current,
          p_streak:    next.streak,
          p_best_hold: next.bestHold,
        }).catch(() => {})
      }
      return next
    })
  }, [matchData])

  const handleOpponentEAR = useCallback(({ ear }) => {
    setOpponentEAR(prev => prev === ear ? prev : ear)
  }, [])

  const handleOpponentVideoFrame = useCallback(({ frame }) => {
    setOpponentFrame(frame)
  }, [])

  const handleRematchRequested = useCallback(() => {
    setRematchStatus(prev => prev === 'requested' ? 'requested' : 'opponent-wants')
  }, [])

  const handleRematchDeclined = useCallback(() => {
    setRematchStatus('declined')
  }, [])

  const {
    connected, joinQueue, sendEAR, sendVideoFrame, sendBlink,
    forfeit, requestRematch, cancelRematch, startInviteMatch,
  } = useGame({
    onMatchFound:         handleMatchFound,
    onMatchEnd:           handleMatchEnd,
    onOpponentEAR:        handleOpponentEAR,
    onOpponentVideoFrame: handleOpponentVideoFrame,
    onRematchRequested:   handleRematchRequested,
    onRematchDeclined:    handleRematchDeclined,
  })

  useEffect(() => {
    return () => { if (queueAdvanceRef.current) clearTimeout(queueAdvanceRef.current) }
  }, [])

  useEffect(() => {
    autoForfeitRef.current = false
    blinkSentRef.current   = false
  }, [matchData?.matchId])

  // Auto-forfeit when tab is hidden during MATCH (not during prematch countdown)
  useEffect(() => {
    function autoForfeit(reason) {
      if (screen !== SCREEN.MATCH || !matchData?.matchId || autoForfeitRef.current) return
      autoForfeitRef.current = true
      setBlinkActive(false)
      forfeit(matchData.matchId, reason)
    }

    if (screen === SCREEN.MATCH && document.hidden) autoForfeit('tab-hidden')

    function handleVisibilityChange() {
      if (screen === SCREEN.MATCH && document.hidden) autoForfeit('tab-hidden')
    }
    function handlePageLeave() { autoForfeit('left-page') }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageLeave)
    window.addEventListener('beforeunload', handlePageLeave)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageLeave)
      window.removeEventListener('beforeunload', handlePageLeave)
    }
  }, [forfeit, matchData?.matchId, screen])

  // ── Blink detection ───────────────────────────────────────────
  const blink = useBlinkDetection({
    videoEl: camera.videoEl,
    enabled: blinkActive,
    onBlink: useCallback(() => {
      if (!matchData?.matchId || blinkSentRef.current) return
      blinkSentRef.current = true
      const holdMs = matchStartMsRef.current
        ? Math.max(0, Date.now() - matchStartMsRef.current)
        : 0
      sendBlink(matchData.matchId, holdMs)
    }, [matchData?.matchId, sendBlink]),
  })

  // ── Flow handlers ─────────────────────────────────────────────
  function handleFindOpponent() {
    setIsLeavingLobby(true)
    setQueueMatched(false)
    joinQueue(playerNameRef.current)
    setTimeout(() => {
      setIsLeavingLobby(false)
      setScreen(SCREEN.MATCHMAKING)
    }, 380)
  }

  function handleCancelQueue() {
    if (queueAdvanceRef.current) {
      clearTimeout(queueAdvanceRef.current)
      queueAdvanceRef.current = null
    }
    setQueueMatched(false)
    setScreen(SCREEN.LOBBY)
  }

  function handleMatchStart() {
    if (document.hidden && matchData?.matchId && !autoForfeitRef.current) {
      autoForfeitRef.current = true
      forfeit(matchData.matchId, 'tab-hidden')
      return
    }
    matchStartMsRef.current = Date.now()
    setOpponentFrame(null)
    setBlinkActive(true)
    setScreen(SCREEN.MATCH)
  }

  function handleRequestRematch() {
    if (resultData?.matchId) {
      setRematchStatus('requested')
      requestRematch(resultData.matchId)
    }
  }

  function handleCancelRematch() {
    if (resultData?.matchId) {
      cancelRematch(resultData.matchId)
      setRematchStatus(null)
    }
  }

  function handleReturnToLobby() {
    if (resultData?.matchId) cancelRematch(resultData.matchId)
    setRematchStatus(null)
    setQueueMatched(false)
    setResultData(null)
    setMatchData(null)
    setScreen(SCREEN.LOBBY)
  }

  function handleForfeit() {
    if (matchData?.matchId) forfeit(matchData.matchId, 'user')
    setBlinkActive(false)
    setOpponentFrame(null)
    setScreen(SCREEN.LOBBY)
  }

  function handleCreateInvite() {
    const code = crypto.randomUUID().slice(0, 8).toUpperCase()
    setInviteCode(code)
    window.history.replaceState(null, '', `?invite=${code}`)
    setIsLeavingLobby(true)
    setTimeout(() => { setIsLeavingLobby(false); setScreen(SCREEN.INVITE_LOBBY) }, 380)
  }

  function handleInviteMatchStart(matchId, opponentHandle, opponentId) {
    window.history.replaceState(null, '', window.location.pathname)
    startInviteMatch(matchId, opponentHandle, opponentId)
  }

  function handleLeaveInvite() {
    window.history.replaceState(null, '', window.location.pathname)
    setInviteCode(null)
    setScreen(SCREEN.LOBBY)
  }

  function handleStartPractice() {
    setIsLeavingLobby(true)
    setTimeout(() => {
      setIsLeavingLobby(false)
      setScreen(SCREEN.PRACTICE)
    }, 380)
  }

  function handleEndPractice(sessionBest) {
    if (sessionBest > practiceBest) {
      setPracticeBest(sessionBest)
      localStorage.setItem('blinkout_solo_best', String(sessionBest))
    }
    setScreen(SCREEN.LOBBY)
  }

  function handleSetName(name) {
    const trimmed = name.trim().slice(0, 30)
    if (!trimmed || !/^[\w\s\-.]{1,30}$/.test(trimmed)) return
    setPlayerName(trimmed)
    localStorage.setItem('blinkout_name', trimmed)
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <main className="app-main">
        {screen === SCREEN.LOBBY && (
          <Lobby
            playerName={playerName}
            stats={stats}
            camera={camera}
            blink={blink}
            connected={connected}
            practiceBest={practiceBest}
            onFindOpponent={handleFindOpponent}
            onCreateInvite={handleCreateInvite}
            onStartPractice={handleStartPractice}
            onSetName={handleSetName}
            isLeaving={isLeavingLobby}
          />
        )}

        {screen === SCREEN.INVITE_LOBBY && inviteCode && (
          <InviteLobby
            playerName={playerName}
            roomCode={inviteCode}
            camera={camera}
            blink={blink}
            onMatchStart={handleInviteMatchStart}
            onLeave={handleLeaveInvite}
          />
        )}

        {screen === SCREEN.MATCHMAKING && (
          <Matchmaking
            playerName={playerName}
            matched={queueMatched}
            onCancel={handleCancelQueue}
          />
        )}

        {screen === SCREEN.PREMATCH && (
          <PreMatch
            camera={camera}
            blink={blink}
            matchData={matchData}
            playerName={playerName}
            onMatchStart={handleMatchStart}
          />
        )}

        {screen === SCREEN.MATCH && (
          <LiveMatch
            camera={camera}
            blink={blink}
            matchData={matchData}
            playerName={playerName}
            sendEAR={sendEAR}
            sendVideoFrame={sendVideoFrame}
            opponentEAR={opponentEAR}
            opponentFrame={opponentFrame}
            lives={{ mine: 3, opponent: 3 }}
          />
        )}

        {screen === SCREEN.RESULT && (
          <Result
            resultData={resultData}
            playerName={playerName}
            stats={stats}
            rematchStatus={rematchStatus}
            onRematch={handleRequestRematch}
            onCancelRematch={handleCancelRematch}
            onLeave={handleReturnToLobby}
          />
        )}

        {screen === SCREEN.PRACTICE && (
          <PracticeMode
            camera={camera}
            blink={blink}
            personalBest={practiceBest}
            onEnd={handleEndPractice}
          />
        )}
      </main>
    </div>
  )
}
