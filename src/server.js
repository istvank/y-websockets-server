#!/usr/bin/env node
/* global process, global */
'use strict'

var Y = require('yjs')
var minimist = require('minimist')
require('y-memory')(Y)
try {
  // try to require local y-websockets-server
  require('./y-websockets-server.js')(Y)
} catch (err) {
  // otherwise require global y-websockets-server
  require('y-websockets-server')
}

var options = minimist(process.argv.slice(2), {
  string: ['port', 'debug'],
  default: {
    port: process.env.PORT || '1234',
    debug: false
  }
})
var port = Number.parseInt(options.port, 10)
var io = require('socket.io')(port)
console.log('Running y-websockets-server on port ' + port)

global.yInstances = {}

function getInstanceOfY (room) {
  if (global.yInstances[room] == null) {
    return Y({
      db: {
        name: 'memory'
      },
      connector: {
        name: 'websockets-server',
        room: room,
        io: io,
        debug: !!options.debug
      }
    }).then(function (y) {
      global.yInstances[room] = y
      return y
    })
  } else {
    return Promise.resolve(global.yInstances[room])
  }
}

io.on('connection', function (socket) {
  var rooms = []
  socket.on('joinRoom', function (room) {
    console.log('User', socket.id, 'joins room:', room)
    socket.join(room)
    getInstanceOfY(room).then(function (y) {
      if (rooms.indexOf(room) === -1) {
        y.connector.userJoined(socket.id, 'slave')
        rooms.push(room)
      }
    })
  })
  socket.on('yjsEvent', function (msg) {
    if (msg.room != null) {
      getInstanceOfY(msg.room).then(function (y) {
        y.connector.receiveMessage(socket.id, msg)
      })
    }
  })
  socket.on('disconnect', function () {
    for (var i = 0; i < rooms.length; i++) {
      let room = rooms[i]
      getInstanceOfY(room).then(function (y) {
        var i = rooms.indexOf(room)
        if (i >= 0) {
          y.connector.userLeft(socket.id)
          rooms.splice(i, 1)
        }
      })
    }
  })
  socket.on('leaveRoom', function (room) {
    getInstanceOfY(room).then(function (y) {
      var i = rooms.indexOf(room)
      if (i >= 0) {
        y.connector.userLeft(socket.id)
        rooms.splice(i, 1)
      }
    })
  })
})
