const stompit = require('stompit')
const { MODULES, EVENT_TYPES } = require('../broker/events')

const service = {
  connectOptions: {
    host: 'localhost',
    port: 61613,
    ssl: false,
    timeout: 30000,
    connectHeaders: {
      host: 'localhost',
      'heart-beat': '1000,2000',
    },
  },

  init(broker) {
    this.manager = new stompit.ConnectFailover([this.connectOptions], {
      maxReconnects: 10,
    })
    this.Broker = broker

    broker.SE.on(MODULES.SERVICE, (e) => {
      const { event, data } = e
      const regex = RegExp('fail', 'i')
      if (regex.test(event)) {
        broker.SE.emit(MODULES.SERVICE, {
          event: EVENT_TYPES.SERVICE_TRANSACTION_ROLLBACK,
          data,
        })
      }
    })

    return this
  },

  emitMsg(destination) {
    this.Broker.SE.emit(this.Broker.MODULES.SERVICE, {
      event: this.Broker.EVENT_TYPES.QUEUE_SUBSCRIPTION,
      data: { msg: `subscribe on ${destination}` },
    })
  },

  subscribe({ destination, onMessage }) {
    const self = this
    this.emitMsg(destination)
    this.manager.connect(function(error, client, reconnect) {
      if (error) {
        console.log('connect error ' + error.message)
        reconnect()
        return
      }

      self.Broker.SE.on(MODULES.SERVICE, (e) => {
        const { event, data } = e
        if (event === EVENT_TYPES.SERVICE_TRANSACTION_COMPLETE) {
          const {
            original: { queMessage },
          } = data

          queMessage
            ? client.ack(queMessage)
            : console.log('ERROR ON QUEUE MSG')
        }
      })

      client.on('error', function(error) {
        console.error('This is error', error)
        reconnect()
      })

      client.on('connecting', function(connector) {
        console.log('Could not connect to ' + connector)
      })

      const subscribeHeaders = {
        timeout: 30000,
        destination,
        ack: 'client',
        heartbeat: [5000, 5000],
      }

      client.subscribe(subscribeHeaders, function(error, message) {
        if (error) {
          console.log('subscribe error ' + error.message, 'Reconnection')
          reconnect()
        }

        message.readString('utf-8', function(error, body) {
          if (error) {
            console.log('read message error ' + error.message)
            return
          }
          onMessage({ error, body, client, message })
        })
      })
    })
  },
}

module.exports = service
