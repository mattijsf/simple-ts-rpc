import { Channel, Client, Server } from "../simple-ts-rpc"

interface MyAPI {
  add(a: number, b: number): Promise<number>
  greet(name: string): Promise<string>
  processItems(items: string[], callback: (processedItem: string) => void): Promise<void>
  triggerTwoCallbacks(
    echo1: string,
    echo2: string,
    callback1: (arg: string) => void,
    callback2: (arg: string) => void
  ): Promise<void>
  subscribeToEvents(callback: (event: string) => void): Promise<void>
  triggerEvent(event: string): Promise<void>
  errorProne(): Promise<void>
}

class MyAPIServer implements MyAPI {
  private eventListeners: Array<(event: string) => void> = []

  async add(a: number, b: number): Promise<number> {
    return a + b
  }

  async greet(name: string): Promise<string> {
    return `Hello, ${name}!`
  }

  async processItems(items: string[], callback: (processedItem: string) => void): Promise<void> {
    for (const item of items) {
      callback(item.toUpperCase())
    }
  }

  async triggerTwoCallbacks(
    echo1: string,
    echo2: string,
    callback1: (arg: string) => void,
    callback2: (arg: string) => void
  ): Promise<void> {
    callback1(echo1)
    callback2(echo2)
  }

  async subscribeToEvents(callback: (event: string) => void): Promise<void> {
    this.eventListeners.push(callback)
  }

  async triggerEvent(event: string): Promise<void> {
    for (const listener of this.eventListeners) {
      listener(event)
    }
  }

  async errorProne(): Promise<void> {
    var error = new Error("Something went wrong!")
    error.name = "RPCError"
    throw error
  }
}

class TestChannel implements Channel {
  private listeners: ((message: string) => void)[] = []

  sendMessage(message: string): void {
    for (const listener of this.listeners) {
      listener(message)
    }
  }

  addMessageListener(listener: (message: string) => void): void {
    this.listeners.push(listener)
  }

  removeMessageListener(listener: (message: string) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener)
  }
}

describe("RPC Library", () => {
  let server: Server<MyAPI>
  let client: Client<MyAPI>
  let channel: TestChannel

  beforeEach(() => {
    channel = new TestChannel()
    server = new Server<MyAPI>(channel, new MyAPIServer())
    client = new Client<MyAPI>(channel)
  })

  afterEach(() => {
    server.cleanup()
    client.cleanup()
  })

  test("Should perform basic RPC", async () => {
    const result = await client.proxy.add(1, 2)
    expect(result).toEqual(3)
  })

  test("Should handle methods with one callback", async () => {
    const items = ["apple", "banana", "cherry"]
    const processedItems: string[] = []

    await client.proxy.processItems(items, item => processedItems.push(item))

    expect(processedItems).toEqual(items.map(item => item.toUpperCase()))
  })

  test("Should handle methods with two callbacks", async () => {
    let response1 = ""
    let response2 = ""
    await client.proxy.triggerTwoCallbacks(
      "Hello",
      "World",
      arg => (response1 = arg),
      arg => (response2 = arg)
    )

    expect(response1).toEqual("Hello")
    expect(response2).toEqual("World")
  })

  test("Should allow subscription to events", async () => {
    const events: string[] = []

    await client.proxy.subscribeToEvents(event => events.push(event))

    await client.proxy.triggerEvent("Test event 1")
    await client.proxy.triggerEvent("Test event 2")

    expect(events).toEqual(["Test event 1", "Test event 2"])
  })

  test("Should handle server errors", async () => {
    await expect(client.proxy.errorProne()).rejects.toThrow("Something went wrong!")
  })
})
