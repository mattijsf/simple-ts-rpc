export interface Channel {
    sendMessage(message: string): void;
    addMessageListener(listener: (message: string) => void): void;
    removeMessageListener(listener: (message: string) => void): void;
}
export declare class Server<T> {
    private channel;
    private proceduresImplementation;
    private senderId;
    constructor(channel: Channel, proceduresImplementation: T);
    private sendServerReadyMessage;
    private createMessage;
    private wrapCallbackArgs;
    private sendMessage;
    private handleMessage;
    cleanup(): void;
}
export declare class Client<T> {
    private channel;
    private _isConnected;
    private onConnectHandler;
    private procedures;
    private callbacks;
    private senderId;
    constructor(channel: Channel);
    private createMessage;
    private sendClientReadyMessage;
    private sendMessage;
    onConnect(handler: () => void): void;
    get isConnected(): boolean;
    get proxy(): T;
    private handleMessage;
    cleanup(): void;
}
