# tango-rpc

TypeScript-based Remote Procedure Call (RPC) library that is almost too simple.

## Key Features

- Typescript
- No dependencies
- Proxy-based client
- Ultra simple string-based `Channel` interface:
```typescript
interface Channel = {
    sendMessage(message: string): void
    addMessageListener(listener: (message: string) => void): void
    removeMessageListener(listener: (message: string) => void): void
}
```
- Support for methods with on or more callback parameters
- Support for subscription/event callbacks
- Server-side error handling
- Lacks most other features


## Installation

```sh
npm install tango-rpc
```
or
```sh
yarn add tango-rpc
```


## Usage

To use this library, you need to define an API interface and supply the API implementation to the server. You'll also need to provide a `Channel` implementation which depends on your use case.

See [tango-rpc.test.ts](src/__tests__/tango-rpc.test.ts) for example usage.

```typescript
interface MyAPI {
  add(a: number, b: number): Promise<number>;
  greet(name: string): Promise<string>;
  processItems(items: string[], callback: (processedItem: string) => void): Promise<void>;
  subscribeToEvents(callback: (event: string) => void): Promise<void>;
  triggerEvent(event: string): Promise<void>;
  errorProne(): Promise<void>;
}

class MyAPIServer implements MyAPI {
  // Implement your API methods here...
}
```

You need to instantiate a `Server` and `Client` with your API and channel.

```typescript
const testChannel = new TestChannel();
const myAPIServer = new MyAPIServer();
const server = new Server<MyAPI>(testChannel, myAPIServer);
const client = new Client<MyAPI>(testChannel);
```

You can use the client's proxy to call API methods as if they were local.

```typescript
const myAPIClient = client.proxy;
myAPIClient.add(1, 2).then(result => console.log(`1 + 2 = ${result}`));
myAPIClient.greet('World').then(result => console.log(result));
myAPIClient.processItems(['apple', 'banana', 'cherry'], item => console.log(`Processed item: ${item}`));
myAPIClient.subscribeToEvents(event => console.log(`Received event: ${event}`));
myAPIClient.triggerEvent('Test event');
myAPIClient.errorProne().catch(error => console.log(`Caught error: ${error.message}`));
```

In case you need to wait until the the server & client are ready you can use the client's `onConnect` event which ensures that the proxy is ready for interaction:

```typescript
client.onConnect(() => {
  console.log(client.isConnected) // true
})
```