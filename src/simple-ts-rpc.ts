type MessageType =
  | "invokeMessage"
  | "callbackMessage"
  | "resultMessage"
  | "errorMessage"
  | "clientReadyMessage"
  | "serverReadyMessage"

type MessageBase = {
  id: string
  senderId: string
  messageType: MessageType
}

type ClientReadyMessage = MessageBase & {
  messageType: "clientReadyMessage"
}

type ServerReadyMessage = MessageBase & {
  messageType: "serverReadyMessage"
}

type InvokeMessage = MessageBase & {
  messageType: "invokeMessage"
  procedure: string
  args: any[]
}

type CallbackMessage = MessageBase & {
  messageType: "callbackMessage"
  callbackId: string
  id: "noop"
  args: any[]
}

type ResultMessage = MessageBase & {
  messageType: "resultMessage"
  result: any
}

type ErrorMessage = MessageBase & {
  messageType: "errorMessage"
  error: string
}

type CallbackArg = {
  type: "callback"
  callbackId: string
}

type AnyMessage =
  | InvokeMessage
  | CallbackMessage
  | ResultMessage
  | ErrorMessage
  | ClientReadyMessage
  | ServerReadyMessage

export interface Channel {
  sendMessage(message: string): void
  addMessageListener(listener: (message: string) => void): void
  removeMessageListener(listener: (message: string) => void): void
}

function isCallbackArg(arg: any): arg is CallbackArg {
  if (arg.type === "callback" && typeof arg.callbackId === "string") {
    return true
  }
  return false
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
    this.sendServerReadyMessage()
  }

  private sendServerReadyMessage(): void {
    const serverReadyMessage = this.createMessage<ServerReadyMessage>({
      id: generateId(),
      messageType: "serverReadyMessage",
    })
    this.sendMessage(serverReadyMessage)
  }

  private createMessage<M extends MessageBase>(message: Omit<M, "senderId">): M {
    return { ...message, senderId: this.senderId } as M
  }

  private wrapCallbackArgs(args: (CallbackArg | any)[]): any[] {
    return args.map(arg => {
      if (isCallbackArg(arg)) {
        return (...callbackArgs: any[]) => {
          const callbackMessage = this.createMessage<CallbackMessage>({
            messageType: "callbackMessage",
            callbackId: arg.callbackId,
            args: callbackArgs,
            id: "noop",
          })
          this.sendMessage(callbackMessage)
        }
      }
      return arg
    })
  }

  private sendMessage(message: MessageBase): void {
    this.channel.sendMessage(JSON.stringify(message))
  }

  private async handleMessage(message: string): Promise<void> {
    const parsedMessage = JSON.parse(message) as AnyMessage
    if (parsedMessage.senderId === this.senderId) return

    if (parsedMessage.messageType === "clientReadyMessage") {
      this.sendServerReadyMessage()
    } else if (parsedMessage.messageType === "invokeMessage") {
      const { id, procedure, args: incomingArgs } = parsedMessage
      const wrappedArgs = this.wrapCallbackArgs(incomingArgs)

      try {
        const procedureFn = this.proceduresImplementation[procedure as keyof T]
        if (typeof procedureFn !== "function") {
          throw new Error(`Procedure '${procedure}' is not a function`)
        }

        const result = await procedureFn.bind(this.proceduresImplementation)(...wrappedArgs)
        const resultMessage = this.createMessage<ResultMessage>({
          messageType: "resultMessage",
          id: id,
          result: result,
        })
        this.sendMessage(resultMessage)
      } catch (error) {
        const errorMessage = this.createMessage<ErrorMessage>({
          messageType: "errorMessage",
          id: id,
          error: `${error}`,
        })
        this.sendMessage(errorMessage)
      }
    }
  }

  cleanup(): void {
    this.channel.removeMessageListener(this.handleMessage)
  }
}

export class Client<T> {
  private _isConnected = false
  private onConnectHandler: (() => void) | null = null
  private procedures: { [id: string]: (result: any) => void } = {}
  private callbacks: { [id: string]: (...args: any[]) => void } = {}
  private senderId: string

  constructor(private channel: Channel) {
    this.senderId = `client-${generateId()}`
    this.channel.addMessageListener(message => this.handleMessage(message))

    this.sendClientReadyMessage()
  }

  private createMessage<M extends MessageBase>(message: Omit<M, "senderId">): M {
    return { ...message, senderId: this.senderId } as M
  }

  private sendClientReadyMessage(): void {
    const connectMessage = this.createMessage<ClientReadyMessage>({
      id: generateId(),
      messageType: "clientReadyMessage",
    })
    this.sendMessage(connectMessage)
  }

  private sendMessage(message: MessageBase): void {
    this.channel.sendMessage(JSON.stringify(message))
  }

  onConnect(handler: () => void): void {
    this.onConnectHandler = handler
    if (this.isConnected) {
      handler()
    }
  }

  get isConnected(): boolean {
    return this._isConnected
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
                return { type: "callback", callbackId } as CallbackArg
              }
              return arg
            })
            const message = this.createMessage<InvokeMessage>({
              messageType: "invokeMessage",
              id: messageId,
              procedure: property,
              args: messageArgs,
            })
            this.sendMessage(message)
            return new Promise(resolve => {
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
      case "serverReadyMessage": {
        const connected = !this._isConnected
        this._isConnected = true
        if (connected && this.onConnectHandler) {
          this.onConnectHandler()
        }
        break
      }
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

  cleanup(): void {
    this.channel.removeMessageListener(this.handleMessage)
  }
}
