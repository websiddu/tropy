'use strict'

const React = require('react')
const { array, bool, number, func } = require('prop-types')
const { DropTarget } = require('react-dnd')
const { NativeTypes } = require('react-dnd-electron-backend')
const { Panel } = require('../panel')
const { PhotoToolbar } = require('./toolbar')
const { PhotoList } = require('./list')
const { PhotoGrid } = require('./grid')
const { isImageSupported } = require('../../image')
const { pick } = require('../../common/util')
const { PHOTO } = require('../../constants/sass')
const cx = require('classnames')


class PhotoPanel extends Panel {
  get classes() {
    return [...super.classes, 'photo-panel', {
      'has-active': this.props.current != null
    }]
  }

  connect(element) {
    return this.props.isDisabled ? element : this.props.dt(element)
  }

  renderToolbar() {
    return (
      <PhotoToolbar
        photos={this.props.photos.length}
        zoom={this.props.zoom}
        maxZoom={PHOTO.ZOOM.length - 1}
        onZoomChange={this.props.onZoomChange}
        hasCreateButton
        canCreate={!this.props.isDisabled && !this.props.isClosed}
        isDisabled={this.props.isClosed || !this.props.photos.length}
        onCreate={this.props.onCreate}/>
    )
  }

  renderContent() {
    const { onDelete, onEdit, onMetadataSave, zoom } = this.props

    const props = {
      ...this.props,
      size: PHOTO.ZOOM[zoom],
      onChange: onMetadataSave,
      onDelete,
      onDropImages: this.handleDropFiles,
      onEdit
    }

    const PhotoIterator = zoom ? PhotoGrid : PhotoList

    return (
      <PhotoIterator {...pick(props, PhotoIterator.getPropKeys())}/>
    )
  }

  render() {
    let toolbar = this.renderToolbar()
    let content = this.renderContent()
    let classes = {
      'drop-target': !this.props.isDisabled,
      'over': this.props.isOver && this.props.canDrop
    }

    return this.connect(
      <section className={cx(this.classes)}>
        {this.renderHeader(toolbar)}
        {this.renderBody(content, classes)}
      </section>
    )
  }


  static propTypes = {
    canDrop: bool,
    isClosed: bool,
    isDisabled: bool,
    isOver: bool,
    current: number,
    photos: array.isRequired,
    zoom: number.isRequired,
    dt: func.isRequired,
    onContract: func.isRequired,
    onCreate: func.isRequired,
    onDelete: func.isRequired,
    onExpand: func.isRequired,
    onEdit: func.isRequired,
    onMetadataSave: func.isRequired,
    onZoomChange: func.isRequired
  }
}


const spec = {
  drop({ onCreate }, monitor) {
    const files = monitor.getItem()
      .files
      .filter(isImageSupported)
      .map(file => file.path)

    return onCreate({ files })
  },

  canDrop(_, monitor) {
    return !!monitor.getItem().types.find(type => isImageSupported({ type }))
  }
}

const collect = (connect, monitor) => ({
  dt: connect.dropTarget(),
  isOver: monitor.isOver(),
  canDrop: monitor.canDrop()
})


module.exports = {
  PhotoPanel: DropTarget(NativeTypes.FILE, spec, collect)(PhotoPanel)
}
