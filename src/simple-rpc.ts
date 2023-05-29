export type MessageBase = {
  id: string
  senderId: string
}

export type Message = MessageBase & {
  messageType: "message"
  procedure: string
  args: any[]
}

export type CallbackMessage = MessageBase & {
  messageType: "callbackMessage"
  callbackId: string
  id: "noop"
  args: any[]
}

export type ResultMessage = MessageBase & {
  messageType: "resultMessage"
  result: any
}

export type ErrorMessage = MessageBase & {
  messageType: "errorMessage"
  error: string
}

export type AnyMessage = Message | CallbackMessage | ResultMessage | ErrorMessage

export type Channel = {
  sendMessage(message: string): void
  addMessageListener(listener: (message: string) => void): void
}

function generateId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${randomPart}`
}

export class Server<T> {
  private senderId: string

  constructor(private channel: Channel, private proceduresImplementation: T) {
    this.senderId = `server-${generateId()}`
    this.channel.addMessageListener(message => this.handleMessage(message))
  }

  private async handleMessage(message: string): Promise<void> {
    const parsedMessage = JSON.parse(message) as AnyMessage
    if (parsedMessage.senderId === this.senderId) return

    if (parsedMessage.messageType === "message") {
      const { id, procedure, args: incomingArgs } = parsedMessage

      const deserializedArgs = incomingArgs.map(arg => {
        if (arg.type === "callback") {
          return (...callbackArgs: any[]) => {
            const callbackMessage: CallbackMessage = {
              messageType: "callbackMessage",
              callbackId: arg.id,
              args: callbackArgs,
              id: "noop",
              senderId: this.senderId,
            }
            this.channel.sendMessage(JSON.stringify(callbackMessage))
          }
        }
        return arg
      })

      try {
        const result = await (this.proceduresImplementation[procedure as keyof T] as any)(
          ...deserializedArgs
        )
        const resultMessage: ResultMessage = {
          messageType: "resultMessage",
          id: id,
          result: result,
          senderId: this.senderId,
        }
        this.channel.sendMessage(JSON.stringify(resultMessage))
      } catch (error) {
        const errorMessage: ErrorMessage = {
          messageType: "errorMessage",
          id: id,
          error: `${error}`,
          senderId: this.senderId,
        }
        this.channel.sendMessage(JSON.stringify(errorMessage))
      }
    }
  }
}

export class Client<T> {
  private procedures: { [id: string]: (result: any) => void } = {}
  private callbacks: { [id: string]: (...args: any[]) => void } = {}
  private senderId: string

  constructor(private channel: Channel) {
    this.senderId = `client-${generateId()}`
    this.channel.addMessageListener(message => this.handleMessage(message))
  }

  get proxy(): T {
    return new Proxy(
      {},
      {
        get: (target, property: string) => {
          return (...args: any[]) => {
            const messageId = generateId()
            const messageArgs = args.map((arg, i) => {
              if (typeof arg === "function") {
                const callbackId = `${messageId}-${i}`
                this.callbacks[callbackId] = arg
                return { type: "callback", id: callbackId }
              }
              return arg
            })
            const message: Message = {
              senderId: this.senderId,
              messageType: "message",
              id: messageId,
              procedure: property,
              args: messageArgs,
            }
            this.channel.sendMessage(JSON.stringify(message))
            return new Promise((resolve, _reject) => {
              this.procedures[messageId] = resolve
            })
          }
        },
      }
    ) as T
  }

  private handleMessage(message: string): void {
    const parsedMessage = JSON.parse(message) as AnyMessage
    if (parsedMessage.senderId === this.senderId) return

    switch (parsedMessage.messageType) {
      case "resultMessage": {
        const { id, result } = parsedMessage
        this.procedures[id](result)
        delete this.procedures[id]
        break
      }

      case "errorMessage": {
        const { id, error } = parsedMessage
        this.procedures[id](Promise.reject(new Error(error)))
        break
      }

      case "callbackMessage": {
        const { callbackId, args } = parsedMessage
        this.callbacks[callbackId](...args)
        break
      }
    }
  }
}
