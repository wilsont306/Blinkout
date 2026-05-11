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
  const [screen, setScreen]           = useState(() => getInviteCode() ? SCREEN.INVITE_LOBBY : SCREEN.LOBBY)
  const [inviteCode, setInviteCode]   = useState(() => getInviteCode() || null)
  const [inviteIsCreator, setInviteIsCreator] = useState(false)
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
  const [myLives, setMyLives]           = useState(3)
  const [opponentLives, setOpponentLives] = useState(3)

  const playerNameRef     = useRef(playerName)
  const queueAdvanceRef   = useRef(null)
  const autoForfeitRef    = useRef(false)
  const blinkSentRef      = useRef(false)
  const matchStartMsRef   = useRef(null)
  const myLivesRef        = useRef(3)

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
    const payload = data && typeof data === 'object' ? data : {}
    const blinkTimestamp = Number.isFinite(payload.blinkTimestamp) ? payload.blinkTimestamp : 0
    const duration = Number.isFinite(payload.duration) ? payload.duration : blinkTimestamp
    const isWin = payload.winner === CLIENT_ID
    const safeResult = {
      ...payload,
      duration,
      blinkTimestamp,
      winner: payload.winner ?? (isWin ? CLIENT_ID : matchData?.opponentId),
      loser: payload.loser ?? (isWin ? matchData?.opponentId : CLIENT_ID),
      matchId: payload.matchId ?? matchData?.matchId ?? crypto.randomUUID(),
      myPlayerId: CLIENT_ID,
      opponentName: matchData?.opponentName ?? 'Opponent',
      isWin,
      reason: payload.reason ?? 'blink',
    }

    try {
      sessionStorage.setItem('blinkout_last_result', JSON.stringify(safeResult))
    } catch {}

    setBlinkActive(false)
    setOpponentFrame(null)
    setRematchStatus(safeResult.reason === 'forfeit' ? 'declined' : null)
    setResultData(safeResult)
    setScreen(SCREEN.RESULT)

    setStats(prev => {
      const previous = prev ?? { wins: 0, losses: 0, streak: 0, bestHold: 0 }
      const next = {
        wins:     isWin ? previous.wins + 1 : previous.wins,
        losses:   isWin ? previous.losses   : previous.losses + 1,
        streak:   isWin ? previous.streak + 1 : 0,
        bestHold: isWin ? Math.max(previous.bestHold || 0, blinkTimestamp) : previous.bestHold,
      }
      if (isWin) {
        window.setTimeout(() => {
          supabase.rpc('upsert_leaderboard', {
            p_handle:    playerNameRef.current,
            p_streak:    next.streak,
            p_best_hold: next.bestHold,
          }).catch(() => {})
        }, 0)
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

  const handleOpponentStrike = useCallback(({ livesLeft }) => {
    setOpponentLives(livesLeft)
  }, [])

  const {
    connected, joinQueue, sendEAR, sendVideoFrame, sendBlink, sendStrike,
    forfeit, requestRematch, cancelRematch, startInviteMatch,
  } = useGame({
    onMatchFound:         handleMatchFound,
    onMatchEnd:           handleMatchEnd,
    onOpponentEAR:        handleOpponentEAR,
    onOpponentVideoFrame: handleOpponentVideoFrame,
    onRematchRequested:   handleRematchRequested,
    onRematchDeclined:    handleRematchDeclined,
    onOpponentStrike:     handleOpponentStrike,
  })

  useEffect(() => {
    return () => { if (queueAdvanceRef.current) clearTimeout(queueAdvanceRef.current) }
  }, [])

  useEffect(() => {
    autoForfeitRef.current = false
    blinkSentRef.current   = false
    myLivesRef.current     = 3
    setMyLives(3)
    setOpponentLives(3)
  }, [matchData?.matchId])

  // Auto-forfeit when tab is hidden during countdown or live match.
  useEffect(() => {
    const matchIsActive = screen === SCREEN.PREMATCH || screen === SCREEN.MATCH

    function autoForfeit(reason) {
      if (!matchIsActive || !matchData?.matchId || autoForfeitRef.current) return
      autoForfeitRef.current = true
      setBlinkActive(false)
      forfeit(matchData.matchId, reason)
    }

    if (matchIsActive && document.hidden) autoForfeit('tab-hidden')

    function handleVisibilityChange() {
      if (document.hidden) autoForfeit('tab-hidden')
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

      if (myLivesRef.current <= 1) {
        blinkSentRef.current = true
        const holdMs = matchStartMsRef.current
          ? Math.max(0, Date.now() - matchStartMsRef.current)
          : 0
        sendBlink(matchData.matchId, holdMs)
      } else {
        myLivesRef.current -= 1
        setMyLives(myLivesRef.current)
        sendStrike(matchData.matchId, myLivesRef.current)
      }
    }, [matchData?.matchId, sendBlink, sendStrike]),
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

  function handleNoFaceForfeit() {
    if (matchData?.matchId) forfeit(matchData.matchId, 'no-face')
    setBlinkActive(false)
    setOpponentFrame(null)
    setResultData({
      winner: matchData?.opponentId ?? 'opponent',
      loser: CLIENT_ID,
      matchId: matchData?.matchId,
      myPlayerId: CLIENT_ID,
      opponentName: matchData?.opponentName ?? 'Opponent',
      isWin: false,
      blinkTimestamp: 0,
      reason: 'no-face',
    })
    setScreen(SCREEN.RESULT)
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

  function handleNewMatch() {
    if (resultData?.matchId) cancelRematch(resultData.matchId)
    setRematchStatus(null)
    setResultData(null)
    setMatchData(null)
    setQueueMatched(false)
    joinQueue(playerNameRef.current)
    setScreen(SCREEN.MATCHMAKING)
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
    setResultData({
      winner: matchData?.opponentId ?? 'opponent',
      loser: CLIENT_ID,
      matchId: matchData?.matchId,
      myPlayerId: CLIENT_ID,
      opponentName: matchData?.opponentName ?? 'Opponent',
      isWin: false,
      blinkTimestamp: 0,
      reason: 'forfeit',
    })
    setScreen(SCREEN.RESULT)
  }

  function handleCreateInvite() {
    const code = crypto.randomUUID().slice(0, 8).toUpperCase()
    setInviteCode(code)
    setInviteIsCreator(true)
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
            isCreator={inviteIsCreator}
            camera={camera}
            blink={blink}
            onMatchStart={handleInviteMatchStart}
            onLeave={handleLeaveInvite}
            onSetName={handleSetName}
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
            onNoFaceForfeit={handleNoFaceForfeit}
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
            lives={{ mine: myLives, opponent: opponentLives }}
            onForfeit={handleForfeit}
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
            onNewMatch={handleNewMatch}
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
