import { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'

// ---------------------------------------------------------------------------
// SONG BANK
// ---------------------------------------------------------------------------
// `clip` should point at a short audio file you own the rights to play,
// dropped into /public/audio/. This game can't ship real Ink Spots
// recordings (they're copyrighted), so until a file exists at that path
// each round falls back to a short synthesized tone — that's expected,
// and lets you test the whole game loop today. Swap in real 5s clips
// whenever you're ready; nothing else needs to change.
const SONG_BANK = [
  { id: 'didnt-care', title: "If I Didn't Care", clip: '/audio/if-i-didnt-care.mp3', note: 261.63 },
  { id: 'we-three', title: 'We Three (My Echo, My Shadow and Me)', clip: '/audio/we-three.mp3', note: 293.66 },
  { id: 'set-fire', title: "I Don't Want to Set the World on Fire", clip: '/audio/set-the-world-on-fire.mp3', note: 329.63 },
  { id: 'maybe', title: 'Maybe', clip: '/audio/maybe.mp3', note: 349.23 },
  { id: 'java-jive', title: 'Java Jive', clip: '/audio/java-jive.mp3', note: 523.25 },
  { id: 'dreamboat', title: 'Dreamboat', clip: '/audio/dreamboat.mp3', note: 523.25 },
  { id: 'my-prayer', title: 'My Prayer', clip: '/audio/my-prayer.mp3', note: 523.25 },
  { id: 'never-smile-again', title: 'Never Smile Again', clip: '/audio/never-smile-again.mp3', note: 523.25 },
]

const NUM_ROUNDS = 5
const NUM_OPTIONS = 4
const CLIP_SECONDS = 5

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildRounds() {
  const order = shuffle(SONG_BANK).slice(0, NUM_ROUNDS)
  return order.map((answer) => {
    const distractors = shuffle(SONG_BANK.filter((s) => s.id !== answer.id)).slice(
      0,
      NUM_OPTIONS - 1
    )
    return { answer, options: shuffle([answer, ...distractors]) }
  })
}

export default function App() {
  const [rounds, setRounds] = useState(buildRounds)
  const [roundIndex, setRoundIndex] = useState(0)
  const [status, setStatus] = useState('idle') // idle | playing | answered
  const [selectedId, setSelectedId] = useState(null)
  const [score, setScore] = useState(0)
  const [usingFallbackTone, setUsingFallbackTone] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  const audioRef = useRef(null)
  const stopTimerRef = useRef(null)
  const audioCtxRef = useRef(null)
  const oscRef = useRef(null)

  const round = rounds[roundIndex]
  const finished = roundIndex >= rounds.length

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    const handler = (e) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const stopEverything = useCallback(() => {
    clearTimeout(stopTimerRef.current)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (oscRef.current) {
      try {
        oscRef.current.stop()
      } catch {
        /* already stopped */
      }
      oscRef.current = null
    }
  }, [])

  useEffect(() => stopEverything, [stopEverything])

  const playFallbackTone = useCallback((note) => {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
    const ctx = audioCtxRef.current
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = note
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05)
    gain.gain.setValueAtTime(0.15, ctx.currentTime + CLIP_SECONDS - 0.3)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + CLIP_SECONDS)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + CLIP_SECONDS)
    oscRef.current = osc
    setUsingFallbackTone(true)
  }, [])

  const playClip = useCallback(() => {
    if (status === 'answered' || !round) return
    stopEverything()
    setStatus('playing')

    const el = audioRef.current
    el.src = round.answer.clip
    el.currentTime = 0
    setUsingFallbackTone(false)

    el
      .play()
      .then(() => {
        stopTimerRef.current = setTimeout(() => {
          el.pause()
          setStatus((s) => (s === 'playing' ? 'idle' : s))
        }, CLIP_SECONDS * 1000)
      })
      .catch(() => {
        playFallbackTone(round.answer.note)
        stopTimerRef.current = setTimeout(() => {
          setStatus((s) => (s === 'playing' ? 'idle' : s))
        }, CLIP_SECONDS * 1000)
      })
  }, [round, status, stopEverything, playFallbackTone])

  const handleAudioError = useCallback(() => {
    if (status !== 'playing' || !round) return
    playFallbackTone(round.answer.note)
  }, [status, round, playFallbackTone])

  const choose = useCallback(
    (optionId) => {
      if (status === 'answered' || !round) return
      stopEverything()
      setSelectedId(optionId)
      setStatus('answered')
      if (optionId === round.answer.id) setScore((s) => s + 1)
    },
    [status, round, stopEverything]
  )

  const nextRound = useCallback(() => {
    stopEverything()
    setSelectedId(null)
    setUsingFallbackTone(false)
    setStatus('idle')
    setRoundIndex((i) => i + 1)
  }, [stopEverything])

  const playAgain = useCallback(() => {
    setRounds(buildRounds())
    setRoundIndex(0)
    setSelectedId(null)
    setUsingFallbackTone(false)
    setScore(0)
    setStatus('idle')
  }, [])

  return (
    <div className="app">
      <audio ref={audioRef} onError={handleAudioError} preload="none" />

      <header className="masthead">
        <p className="eyebrow">A Listening Game</p>
        <h1>Name That Ink Spots Tune</h1>
        <p className="tagline">Cue the needle. You've got five seconds.</p>
      </header>

      {!finished ? (
        <main className="stage">
          <div className="status-row">
            <span className="chip">Round {roundIndex + 1} of {rounds.length}</span>
            <span className="chip chip--score">Score {score}</span>
          </div>

          <div className="dial-wrap">
            <button
              type="button"
              className={`dial ${status === 'playing' ? 'dial--spinning' : ''}`}
              onClick={playClip}
              disabled={status === 'playing' || status === 'answered'}
              aria-label={
                status === 'playing' ? 'Clip is playing' : 'Play five second clip'
              }
              style={prefersReducedMotion ? { animationDuration: '0s' } : undefined}
            >
              <span className="dial__grooves" aria-hidden="true" />
              <span className="dial__label">
                {status === 'playing' ? 'Playing…' : status === 'answered' ? '♪' : 'Play'}
              </span>
            </button>
            <div
              className={`tonearm ${status === 'playing' ? 'tonearm--down' : ''}`}
              aria-hidden="true"
            />
          </div>

          <p className="hint">
            {status === 'idle' && 'Press the record to hear a 5-second clip.'}
            {status === 'playing' && 'Listening…'}
            {status === 'answered' &&
              (selectedId === round.answer.id ? 'Correct!' : 'Not quite.')}
          </p>

          <div className="options" role="group" aria-label="Song choices">
            {round.options.map((opt) => {
              const isAnswer = opt.id === round.answer.id
              const isSelected = opt.id === selectedId
              const revealed = status === 'answered'
              const cls = [
                'option',
                revealed && isAnswer ? 'option--correct' : '',
                revealed && isSelected && !isAnswer ? 'option--wrong' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={cls}
                  disabled={status !== 'playing' && status !== 'idle'}
                  onClick={() => choose(opt.id)}
                >
                  {opt.title}
                </button>
              )
            })}
          </div>

          {status === 'answered' && (
            <button type="button" className="next-btn" onClick={nextRound} autoFocus>
              {roundIndex + 1 < rounds.length ? 'Next round →' : 'See your score →'}
            </button>
          )}

          {usingFallbackTone && status !== 'idle' && (
            <p className="footnote">
              Playing a placeholder tone — add a real clip at{' '}
              <code>{round.answer.clip}</code> to hear the actual recording.
            </p>
          )}
        </main>
      ) : (
        <main className="stage stage--final">
          <p className="eyebrow">Final Score</p>
          <p className="final-score">
            {score} <span>/ {rounds.length}</span>
          </p>
          <p className="hint">
            {score === rounds.length
              ? "Perfect ear — you've clearly spun this record before."
              : score >= Math.ceil(rounds.length / 2)
              ? 'Solid run. The Ink Spots would approve.'
              : 'Room to grow — give it another spin.'}
          </p>
          <button type="button" className="next-btn" onClick={playAgain}>
            Play again
          </button>
        </main>
      )}

      <footer className="footer">
        <div className="ticks" aria-hidden="true" />
        <p>Four-part harmony, five seconds at a time.</p>
      </footer>
    </div>
  )
}
