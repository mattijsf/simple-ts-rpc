export type MessageBase = {
  id: string
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

export class Server<T> {
  constructor(private channel: Channel, private proceduresImplementation: T) {
    this.channel.addMessageListener(message => this.handleMessage(message))
  }

  private async handleMessage(message: string): Promise<void> {
    const { id, procedure, args: incomingArgs } = JSON.parse(message) as Message

    console.log("MESSAGE", message)

    const deserializedArgs = incomingArgs.map(arg => {
      if (arg.type === "callback") {
        return (...callbackArgs: any[]) => {
          const callbackMessage: CallbackMessage = {
            messageType: "callbackMessage",
            callbackId: arg.id,
            args: callbackArgs,
            id: "noop",
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
      }
      this.channel.sendMessage(JSON.stringify(resultMessage))
    } catch (error) {
      const errorMessage: ErrorMessage = {
        messageType: "errorMessage",
        id: id,
        error: `${error}`,
      }
      this.channel.sendMessage(JSON.stringify(errorMessage))
    }
  }
}

export class Client<T> {
  private procedures: { [id: string]: (result: any) => void } = {}
  private callbacks: { [id: string]: (...args: any[]) => void } = {}
  private nextId = 0

  constructor(private channel: Channel) {
    this.channel.addMessageListener(message => this.handleMessage(message))
  }

  get proxy(): T {
    return new Proxy(
      {},
      {
        get: (target, property: string) => {
          return (...args: any[]) => {
            const id = (this.nextId++).toString()
            const callbackArgs = args.filter(arg => typeof arg === "function")
            const nonCallbackArgs = args.filter(arg => typeof arg !== "function")
            const serializedArgs = nonCallbackArgs.map((arg, i) =>
              callbackArgs[i] ? { type: "callback", id: id + i } : arg
            )
            this.procedures[id] = (): void => {}
            callbackArgs.forEach((callback, i) => {
              this.callbacks[id + i] = callback
            })
            const message: Message = {
              messageType: "message",
              id,
              procedure: property,
              args: serializedArgs,
            }
            this.channel.sendMessage(JSON.stringify(message))
            return new Promise((resolve, _reject) => {
              this.procedures[id] = resolve
            })
          }
        },
      }
    ) as T
  }

  private handleMessage(message: string): void {
    const messageObj = JSON.parse(message) as AnyMessage

    switch (messageObj.messageType) {
      case "resultMessage": {
        const { id, result } = messageObj
        this.procedures[id](result)
        delete this.procedures[id]
        break
      }

      case "errorMessage": {
        const { id, error } = messageObj
        this.procedures[id](Promise.reject(new Error(error)))
        break
      }

      case "callbackMessage": {
        const { callbackId, args } = messageObj
        this.callbacks[callbackId](...args)
        break
      }
    }
  }
}
