'use strict'

const React = require('react')
const { arrayOf, bool, func, object } = require('prop-types')
const { ItemIterator } = require('./iterator')
const { ItemTableRow } = require('./table-row')
const { ItemTableSpacer } = require('./table-spacer')
const { ItemTableHead } = require('./table-head')
const cx = require('classnames')
const { noop } = require('../../common/util')
const { NAV, SASS: { ROW, SCROLLBAR } } = require('../../constants')
const { bounds, on, off, maxScrollLeft } = require('../../dom')
const { match } = require('../../keymap')
const { refine, restrict, shallow, splice, warp } = require('../../common/util')
const { assign } = Object
const throttle = require('lodash.throttle')


class ItemTable extends ItemIterator {
  constructor(props) {
    super(props)

    assign(this.state, this.getColumnState(props))

    refine(this, 'handleKeyDown', ([event]) => {
      if (event.isPropagationStopped()) return

      switch (match(this.props.keymap, event)) {
        case 'edit':
          this.edit(this.current())
          break
        default:
          return
      }

      event.preventDefault()
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation()
    })
  }

  componentWillUnmount() {
    super.componentWillUnmount()
    if (this.table) {
      off(this.table, 'scroll', this.handleHorizontalScroll, {
        capture: true, passive: true
      })
    }
  }

  componentDidUpdate() {
    if (this.props.edit != null) {
      for (let id in this.props.edit) {
        this.scrollIntoView({ id: Number(id) }, false)
      }
    }
  }

  componentWillReceiveProps(props) {
    super.componentWillReceiveProps(props)
    if (!shallow(this.props, props, ['columns', 'list'])) {
      this.setState({
        ...this.getColumnState(props),
        hasMaxScrollLeft: this.hasMaxScrollLeft()
      })
    }
  }

  get classes() {
    return ['table-body', {
      'drop-target': !this.props.isDisabled,
      'over': this.props.isOver
    }]
  }

  update(props = this.props) {
    super.update(props)
    this.setState({
      hasMaxScrollLeft: this.hasMaxScrollLeft()
    })
  }

  getColumnState(props = this.props) {
    let minWidth = 0
    let columns = props.columns
    let colwidth = columns.map(c => ((minWidth += c.width), c.width))

    if (this.hasPositionColumn(props)) {
      minWidth += NAV.COLUMN.POSITION.width
    }

    if (this.props.hasScrollbars) {
      minWidth += SCROLLBAR.WIDTH
    }

    return {
      columns,
      colwidth,
      minWidth
    }
  }

  getColumns() {
    return 1
  }

  getPosition(index) {
    return (this.props.sort.asc) ?
      index + 1 :
      this.props.items.length - index
  }

  getRowHeight() {
    return ROW.HEIGHT
  }

  hasMaxScrollLeft() {
    return this.props.hasScrollbars &&
      this.table != null &&
      maxScrollLeft(this.table)
  }

  edit(item) {
    const { property } = this.state.columns[0]
    this.props.onEdit({
      column: { [item.id]: property.id }
    })
  }

  handleChange = (...args) => {
    this.props.onMetadataSave(...args)
    this.container.focus()
  }

  handleEditCancel = (...args) => {
    this.props.onEditCancel(...args)
    this.container.focus()
  }

  getOffsetInTable(x, { offset, min, max } = this.dragstate) {
    return restrict(x - offset - bounds(this.table).left, min, max)
  }

  setColumnOffset(offset = 0, column = 'drag') {
    this.table.style.setProperty(`--${column}-offset`, `${offset}px`)
  }

  getMaxColumnOffset(idx) {
    let max = this.state.minWidth - this.state.colwidth[idx]
    return (this.props.hasScrollbars) ? max - SCROLLBAR.WIDTH : max
  }

  handleColumnOrderStart = (idx, event) => {
    this.handleColumnOrderReset()
    let min = this.hasPositionColumn() ? NAV.COLUMN.POSITION.width : 0
    let max = this.getMaxColumnOffset(idx)
    let offset = event.nativeEvent.offsetX + ROW.PADDING
    let origin = this.getOffsetInTable(event.clientX, { min, max, offset })
    this.dragstate = { max, min, idx, offset, origin }
  }

  handleColumnOrderStop = () => {
    let { drag, drop } = this.state
    let columns = warp(this.state.columns, drag, drop)
    this.setState({ columns })
    this.handleColumnOrderReset()
    this.props.onColumnOrder({
      order: columns.reduce((ord, col, idx) => ((ord[col.id] = idx), ord), {})
    })
  }

  handleColumnOrderReset = () => {
    this.setState({ drag: null, drop: null })
    this.setColumnOffset(0)
    this.setColumnOffset(0, 'drop')
    this.dragstate = null
  }

  handleColumnOrder = (event) => {
    let { idx, origin } = this.dragstate
    let { colwidth } = this.state
    let offset = this.getOffsetInTable(event.clientX)
    let delta = offset - origin
    let tgt = idx
    let mov = delta

    if (delta > 0) {
      while (tgt < colwidth.length - 1 && colwidth[tgt + 1] / 2 < mov) {
        tgt += 1
        mov -= colwidth[tgt]
      }
    } else {
      mov = -mov
      while (tgt > 0 && colwidth[tgt - 1] / 2 < mov) {
        tgt -= 1
        mov -= colwidth[tgt]
      }
    }

    this.setState({ drag: idx, drop: tgt })
    this.setColumnOffset(delta)
    this.setColumnOffset(
      (tgt === idx) ? 0 : (tgt < idx) ? colwidth[idx] : -colwidth[idx], 'drop'
    )
  }

  handleColumnResize = ({ column, width }, doCommit) => {
    const prev = this.state.colwidth[column]

    this.setState({
      colwidth: splice(this.state.colwidth, column, 1, width),
      minWidth: this.state.minWidth - prev + width
    })

    if (doCommit) {
      this.props.onColumnResize({ column, width })
    }
  }

  handleHorizontalScroll = throttle(() => {
    this.setState({
      hasMaxScrollLeft: this.hasMaxScrollLeft()
    })
  }, 25)

  setTable = (table) => {
    if (this.table) {
      off(this.table, 'scroll', this.handleHorizontalScroll, {
        capture: true, passive: true
      })
    }

    this.table = table

    if (this.table) {
      on(this.table, 'scroll', this.handleHorizontalScroll, {
        capture: true, passive: true
      })
    }
  }

  renderTableBody() {
    const { data, edit } = this.props
    const onEdit = this.props.selection.length === 1 ? this.props.onEdit : noop

    const { columns, colwidth, height, minWidth } = this.state
    const { transform } = this

    const hasPositionColumn = this.hasPositionColumn()

    return this.connect(
      <div
        className={cx(this.classes)}
        style={{ minWidth }}
        onClick={this.handleClickOutside}>
        <div
          className="scroll-container"
          ref={this.setContainer}
          tabIndex={this.tabIndex}
          onKeyDown={this.handleKeyDown}>
          <div className="runway click-catcher" style={{ height }}>
            <table className="viewport" style={{ transform }}>
              <ItemTableSpacer
                columns={columns}
                colwidth={colwidth}
                hasPositionColumn={hasPositionColumn}/>
              <tbody>
                {this.mapIterableRange(({ item, index, ...props }) =>
                  <ItemTableRow {...props}
                    key={item.id}
                    columns={columns}
                    data={data[item.id]}
                    drag={this.state.drag}
                    drop={this.state.drop}
                    edit={edit}
                    hasPositionColumn={hasPositionColumn}
                    item={item}
                    position={this.getPosition(index)}
                    onCancel={this.handleEditCancel}
                    onChange={this.handleChange}
                    onEdit={onEdit}/>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  render() {
    return (this.props.isEmpty) ? this.renderNoItems() : (
      <div
        ref={this.setTable}
        className={cx('item-table', {
          'dragging-column': this.state.drag != null,
          'max-scroll-left': this.state.hasMaxScrollLeft
        })}>
        <ItemTableHead
          columns={this.state.columns}
          colwidth={this.state.colwidth}
          drag={this.state.drag}
          drop={this.state.drop}
          hasPositionColumn={this.hasPositionColumn()}
          sort={this.props.sort}
          onOrder={this.handleColumnOrder}
          onOrderReset={this.handleColumnOrderReset}
          onOrderStart={this.handleColumnOrderStart}
          onOrderStop={this.handleColumnOrderStop}
          onResize={this.handleColumnResize}
          onSort={this.props.onSort}/>
        {this.renderTableBody()}
      </div>
    )
  }

  static propTypes = {
    ...ItemIterator.propTypes,
    columns: arrayOf(object).isRequired,
    edit: object,
    data: object.isRequired,
    hasScrollbars: bool.isRequired,
    onColumnOrder: func.isRequired,
    onColumnResize: func.isRequired,
    onEdit: func.isRequired,
    onEditCancel: func.isRequired,
    onMetadataSave: func.isRequired
  }

  static defaultProps = {
    ...ItemIterator.defaultProps,
    overscan: 2,
    hasScrollbars: ARGS.scrollbars
  }
}


module.exports = {
  ItemTable
}
