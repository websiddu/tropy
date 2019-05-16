'use strict'

const React = require('react')
const { Editable } = require('../editable')
const { FormattedMessage } = require('react-intl')
const { blank, noop, pluck, URI } = require('../../common/util')
const { IconLock, IconWarningSm } = require('../icons')
const cx = require('classnames')
const { TYPE } = require('../../constants')
const { getMetadataCompletions } = require('../../selectors')
const { auto } = require('../../format')
const { bool, func, number, oneOfType, shape, string } = require('prop-types')


class MetadataField extends React.PureComponent {
  get classes() {
    return ['metadata-field', {
      extra: this.props.isExtra,
      mixed: this.props.isMixed,
      [this.props.type]: true
    }]
  }

  get isInvalid() {
    return this.props.isRequired && blank(this.props.text)
  }

  get label() {
    return this.props.label ||
      this.props.property.label ||
      URI.getLabel(this.props.property.id)
  }

  get property() {
    return this.props.property.id
  }

  get details() {
    return pluck(this.props.property, ['id', 'description', 'comment'])
  }

  handleClick = () => {
    if (!this.props.isDisabled && !this.props.isReadOnly) {
      this.props.onEdit(this.property)
    }
  }

  handleChange = (text, hasChanged = true) => {
    this.props.onChange({
      [this.property]: { text, type: this.props.type }
    }, hasChanged)
  }

  handleCancel = (hasChanged, hasBeenForced) => {
    if (hasBeenForced) this.props.onEditCancel()
    else this.handleChange(this.props.text, hasChanged)
  }

  handleContextMenu = (event) => {
    if (!this.props.isDisabled && !this.props.isReadOnly) {
      this.props.onContextMenu(event, {
        isExtra: this.props.isExtra,
        property: this.property
      })
    }
  }

  handleKeyDown = (event, input) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation()

      if (input.hasChanged) input.commit(true)

      if (event.shiftKey) this.props.onPrev()
      else this.props.onNext()
    }
  }


  render() {
    let { classes, details, label, isInvalid } = this

    return (
      <li
        className={cx(classes)}
        onContextMenu={this.handleContextMenu}>
        <label title={details.join('\n\n')}>{label}</label>
        <div className="value" onClick={this.handleClick}>
          <Editable
            value={this.props.text}
            getCompletions={getMetadataCompletions}
            display={auto(this.props.text, this.props.type)}
            placeholder={this.props.placeholder}
            isActive={this.props.isEditing}
            isRequired={this.props.isRequired}
            onCancel={this.handleCancel}
            onChange={this.handleChange}
            onKeyDown={this.handleKeyDown}/>
          {isInvalid && <IconWarningSm/>}
          {this.props.isReadOnly && <IconLock/>}
        </div>
      </li>
    )
  }


  static propTypes = {
    isEditing: bool,
    isDisabled: bool,
    isExtra: bool.isRequired,
    isMixed: bool,
    isRequired: bool,
    isReadOnly: bool,

    property: shape({
      id: string.isRequired,
      label: string,
      type: string,
      description: string,
      comment: string
    }).isRequired,

    label: string,
    placeholder: string,
    text: string,
    type: string.isRequired,

    onEdit: func.isRequired,
    onEditCancel: func.isRequired,
    onChange: func.isRequired,
    onContextMenu: func,
    onNext: func.isRequired,
    onPrev: func.isRequired
  }

  static defaultProps = {
    type: TYPE.TEXT,
    onContextMenu: noop
  }
}


class StaticField extends React.PureComponent {
  get classes() {
    return ['metadata-field', 'static', {
      clickable: this.props.onClick != null
    }]
  }

  render() {
    return this.props.value && (
      <li className={cx(this.classes)}>
        <label>
          <FormattedMessage id={this.props.label}/>
        </label>
        <div
          className="value"
          onClick={this.props.onClick}
          title={this.props.hint}>
          <div className="static">{this.props.value}</div>
        </div>
      </li>
    )
  }

  static propTypes = {
    hint: string,
    label: string.isRequired,
    value: oneOfType([string, number]).isRequired,
    onClick: func
  }
}


module.exports = {
  MetadataField,
  StaticField
}
