import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { CLIENT_ID } from '../../hooks/useGame.js'

export default function InviteLobby({ playerName, roomCode, onMatchStart, onLeave }) {
  const [opponent, setOpponent]   = useState(null)   // { clientId, handle, isReady }
  const [iAmReady, setIAmReady]   = useState(false)
  const [copied, setCopied]       = useState(false)
  const [starting, setStarting]   = useState(false)
  const channelRef                = useRef(null)
  const startedRef                = useRef(false)

  const inviteUrl = `${window.location.origin}?invite=${roomCode}`

  useEffect(() => {
    const ch = supabase.channel(`invite:${roomCode}`)

    ch.on('presence', { event: 'sync' }, () => {
      const presences = Object.values(ch.presenceState()).flat()
      const opp = presences.find(p => p.clientId !== CLIENT_ID)
      setOpponent(opp ?? null)

      if (
        !startedRef.current &&
        presences.length === 2 &&
        presences.every(p => p.isReady)
      ) {
        startedRef.current = true
        setStarting(true)
        const oppPresence = presences.find(p => p.clientId !== CLIENT_ID)
        setTimeout(() => {
          onMatchStart(roomCode, oppPresence.handle, oppPresence.clientId)
        }, 800)
      }
    })

    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ clientId: CLIENT_ID, handle: playerName, isReady: false })
      }
    })

    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [roomCode, playerName, onMatchStart])

  const handleReady = async () => {
    if (iAmReady || !opponent) return
    setIAmReady(true)
    await channelRef.current?.track({ clientId: CLIENT_ID, handle: playerName, isReady: true })
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="poster-screen poster-screen--invite">
      <div className="poster-card poster-card--invite">
        <div className="poster-meta">Blink Duel · Private Match · {roomCode}</div>
        <div className="poster-kicker">Invite</div>

        <h1 className="poster-headline">
          Private <span>duel.</span>
        </h1>
        <p className="poster-subline">
          {opponent
            ? `${opponent.handle} has joined the room`
            : 'Share the link — waiting for your opponent'}
        </p>

        <div className="invite-players">
          <div className="invite-player invite-player--you">
            <span className="invite-player__label">YOU</span>
            <strong className="invite-player__name">{playerName}</strong>
            <span className={`invite-player__status${iAmReady ? ' is-ready' : ''}`}>
              {iAmReady ? 'READY' : 'NOT READY'}
            </span>
          </div>

          <div className="invite-vs">VS</div>

          <div className={`invite-player invite-player--opp${opponent ? '' : ' invite-player--empty'}`}>
            <span className="invite-player__label">OPP</span>
            <strong className="invite-player__name">
              {opponent ? opponent.handle : '???'}
            </strong>
            <span className={`invite-player__status${opponent?.isReady ? ' is-ready' : ''}`}>
              {opponent ? (opponent.isReady ? 'READY' : 'NOT READY') : 'WAITING'}
            </span>
          </div>
        </div>

        {!opponent && (
          <button className="invite-copy-btn" type="button" onClick={handleCopy}>
            {copied ? '✓ Copied!' : 'Copy invite link'}
            <small>{inviteUrl}</small>
          </button>
        )}

        <div className="invite-actions">
          <button
            className={`poster-cta poster-cta--ready${iAmReady ? ' poster-cta--waiting' : ''}${starting ? ' poster-cta--glow' : ''}`}
            type="button"
            onClick={handleReady}
            disabled={!opponent || iAmReady || starting}
          >
            {starting ? 'Starting…' : iAmReady ? 'Waiting for opponent…' : 'Ready'}
            <small>
              {starting
                ? 'entering the duel'
                : iAmReady
                ? `waiting for ${opponent?.handle}`
                : opponent
                ? 'both must be ready to start'
                : 'waiting for opponent to join'}
            </small>
          </button>

          <button className="poster-cta poster-cta--cancel" type="button" onClick={onLeave}>
            Leave
            <small>return to lobby</small>
          </button>
        </div>

        <div className="poster-footnote">Blink Duel · Private Match</div>
      </div>
    </div>
  )
}
