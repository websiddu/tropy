'use strict'

const React = require('react')
const { Component, PropTypes } = React
const { CoverImage } = require('./cover-image')
const cn = require('classnames')


class ItemTile extends Component {

  handleClick = () => {
    const { item, isSelected, onSelect } = this.props
    onSelect(item.id, isSelected ? 'clear' : 'replace')
  }

  render() {
    const { item, cache, size, isSelected } = this.props

    return (
      <li
        className={cn({ 'item-tile': true, 'active': isSelected })}
        onClick={this.handleClick}
        style={{
          flexBasis: (size * 1.25 + 'px'),
          height: (size * 1.25 + 'px')
        }}>
        <CoverImage item={item} size={size} cache={cache}/>
      </li>
    )
  }

  static propTypes = {
    isSelected: PropTypes.bool,

    size: PropTypes.number.isRequired,
    cache: PropTypes.string.isRequired,
    item: PropTypes.shape({
      id: PropTypes.number.isRequired
    }),

    onSelect: PropTypes.func.isRequired
  }
}

module.exports = {
  ItemTile
}
