import { Component } from 'react'
import ResultCrashFallback from './ResultCrashFallback.jsx'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[BlinkOut render crash]', error, info)
  }

  render() {
    if (this.state.hasError) return <ResultCrashFallback />
    return this.props.children
  }
}
