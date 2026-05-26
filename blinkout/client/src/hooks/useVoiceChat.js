import { useState, useEffect, useRef, useCallback } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/**
 * WebRTC peer-to-peer voice chat.
 *
 * amInitiator: the player with the smaller CLIENT_ID creates the offer.
 * Signaling (offer/answer/ice) flows through the Supabase game channel
 * via the callbacks passed in from useGame.
 */
export function useVoiceChat({
  micStreamRef,      // ref to local MediaStream (from useMicrophone)
  amInitiator,       // boolean — who sends the offer
  enabled,           // only active during MATCH screen
  // signaling senders (from useGame)
  sendVoiceOffer,
  sendVoiceAnswer,
  sendVoiceIce,
  // incoming signaling events — call these from useGame callbacks
  offerEvent,        // { sdp } | null — set by parent when offer arrives
  answerEvent,       // { sdp } | null
  iceEvent,          // { candidate } | null
}) {
  const [rtcConnected, setRtcConnected] = useState(false)
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0)

  const pcRef          = useRef(null)
  const remoteCtxRef   = useRef(null)
  const remoteAnalyser = useRef(null)
  const rafRef         = useRef(null)
  const remoteAudioEl  = useRef(null)

  // ── Cleanup helper ─────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (remoteAudioEl.current) {
      remoteAudioEl.current.srcObject = null
      remoteAudioEl.current = null
    }
    remoteCtxRef.current?.close()
    remoteCtxRef.current  = null
    remoteAnalyser.current = null
    pcRef.current?.close()
    pcRef.current = null
    setRtcConnected(false)
    setRemoteAudioLevel(0)
  }, [])

  // ── Remote audio level meter ───────────────────────────────
  function startRemoteLevelMeter(stream) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    remoteCtxRef.current?.close()

    const ctx      = new AudioContext()
    const source   = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize               = 256
    analyser.smoothingTimeConstant = 0.75
    source.connect(analyser)

    remoteCtxRef.current  = ctx
    remoteAnalyser.current = analyser

    const data = new Uint8Array(analyser.frequencyBinCount)
    function tick() {
      analyser.getByteFrequencyData(data)
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) / 255
      setRemoteAudioLevel(rms)
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  // ── Build RTCPeerConnection ────────────────────────────────
  const buildPC = useCallback(() => {
    cleanup()

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    // Add local mic track
    const localStream = micStreamRef?.current
    if (localStream) {
      localStream.getAudioTracks().forEach(track => pc.addTrack(track, localStream))
    }

    // Receive remote audio
    pc.ontrack = (e) => {
      const [remoteStream] = e.streams
      if (!remoteStream) return

      // Play remote audio via a hidden <audio> element (avoids echo on same tab)
      if (!remoteAudioEl.current) {
        const el = document.createElement('audio')
        el.autoplay = true
        el.volume   = 1
        document.body.appendChild(el)
        remoteAudioEl.current = el
      }
      remoteAudioEl.current.srcObject = remoteStream
      startRemoteLevelMeter(remoteStream)
    }

    // Trickle ICE
    pc.onicecandidate = (e) => {
      if (e.candidate) sendVoiceIce?.(e.candidate.toJSON())
    }

    pc.onconnectionstatechange = () => {
      setRtcConnected(pc.connectionState === 'connected')
      if (pc.connectionState === 'failed') cleanup()
    }

    return pc
  }, [micStreamRef, sendVoiceIce, cleanup])

  // ── Initiate connection (offer side) ──────────────────────
  const initiate = useCallback(async () => {
    const pc = buildPC()
    const offer = await pc.createOffer({ offerToReceiveAudio: true })
    await pc.setLocalDescription(offer)
    sendVoiceOffer?.({ type: offer.type, sdp: offer.sdp })
  }, [buildPC, sendVoiceOffer])

  // ── Start / cleanup based on enabled ──────────────────────
  useEffect(() => {
    if (!enabled) { cleanup(); return }
    if (amInitiator) initiate()
    else buildPC()   // responder: just prepare PC, wait for offer
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle incoming offer (responder) ─────────────────────
  useEffect(() => {
    if (!offerEvent || !pcRef.current) return
    const pc = pcRef.current

    async function handleOffer() {
      await pc.setRemoteDescription({ type: 'offer', sdp: offerEvent.sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendVoiceAnswer?.({ type: answer.type, sdp: answer.sdp })
    }
    handleOffer().catch(console.error)
  }, [offerEvent]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle incoming answer (initiator) ────────────────────
  useEffect(() => {
    if (!answerEvent || !pcRef.current) return
    pcRef.current
      .setRemoteDescription({ type: 'answer', sdp: answerEvent.sdp })
      .catch(console.error)
  }, [answerEvent])

  // ── Handle incoming ICE candidates ────────────────────────
  useEffect(() => {
    if (!iceEvent || !pcRef.current) return
    pcRef.current
      .addIceCandidate(iceEvent.candidate)
      .catch(console.error)
  }, [iceEvent])

  useEffect(() => () => cleanup(), [cleanup])

  return { rtcConnected, remoteAudioLevel }
}
