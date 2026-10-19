import { Component } from 'react'
import ResultCrashFallback from './ResultCrashFallback.jsx'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
    this.reset = this.reset.bind(this)
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[BlinkOut render crash]', error, info)
  }

  reset() {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) return <ResultCrashFallback onReset={this.reset} />
    return this.props.children
  }
}
