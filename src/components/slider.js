'use strict'

const React = require('react')
const { Component, PropTypes } = React
const cn = require('classnames')
const { bounds } = require('../dom')


class Slider extends Component {
  constructor(props) {
    super(props)

    this.state = {
      value: props.value
    }
  }

  componentWillReceiveProps({ value }) {
    this.setState({ value })
  }

  setScale = (scale) => {
    this.scale = scale
  }

  handleClick = (event) => {
    const { min, max } = this.props
    const { left, width } = bounds(this.scale)
    this.set(min + restrict((event.pageX - left) / width) * max)
  }

  set = (value) => {
    this.setState({ value })

    const int = Math.round(value)

    if (int !== this.props.value) {
      this.props.onChange(int)
    }
  }

  min = (event) => {
    event.stopPropagation()
    this.set(this.props.min)
  }

  max = (event) => {
    event.stopPropagation()
    this.set(this.props.max)
  }

  get offset() {
    return this.state.value - this.props.min
  }

  get delta() {
    return this.props.max - this.props.min
  }

  renderMinButton() {
    const { min, minIcon } = this.props
    const { value } = this.state
    const active = value === min

    if (minIcon) {
      return (
        <button className={cn({ active }, 'btn btn-icon')} onClick={this.min}>
          {this.props.minIcon}
        </button>
      )
    }
  }

  renderMaxButton() {
    const { max, maxIcon } = this.props
    const { value } = this.state
    const active = value === max

    if (maxIcon) {
      return (
        <button className={cn({ active }, 'btn btn-icon')} onClick={this.max}>
          {this.props.maxIcon}
        </button>
      )
    }
  }

  render() {
    const { disabled } = this.props
    const { offset, delta } = this

    const pos = `${100 * offset / delta}%`

    return (
      <div
        className={cn({ slider: true, disabled })}
        onClick={this.handleClick}>
        {this.renderMinButton()}
        <div
          ref={this.setScale}
          className="slider-scale">
          <div className="slider-range" style={{ width: pos }}/>
          <div className="slider-handle" style={{ left: pos }}/>
        </div>
        {this.renderMaxButton()}
      </div>
    )
  }

  static propTypes = {
    value: PropTypes.number.isRequired,
    disabled: PropTypes.bool,

    min: PropTypes.number,
    max: PropTypes.number,

    minIcon: PropTypes.element,
    maxIcon: PropTypes.element,

    onChange: PropTypes.func
  }

  static defaultProps = {
    min: 0,
    max: 1
  }
}

function restrict(value, lower = 0, upper = 1) {
  return Math.min(Math.max(value, lower), upper)
}

module.exports = {
  Slider
}
