(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.TangoRPC = {}));
})(this, (function (exports) { 'use strict';

    /******************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function isCallbackArg(arg) {
        if (arg.type === "callback" && typeof arg.callbackId === "string") {
            return true;
        }
        return false;
    }
    function generateId() {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 8);
        return `${timestamp}-${randomPart}`;
    }
    class Server {
        constructor(channel, proceduresImplementation) {
            this.channel = channel;
            this.proceduresImplementation = proceduresImplementation;
            this.senderId = `server-${generateId()}`;
            this.channel.addMessageListener(message => this.handleMessage(message));
            this.sendServerReadyMessage();
        }
        sendServerReadyMessage() {
            const serverReadyMessage = this.createMessage({
                id: generateId(),
                messageType: "serverReadyMessage",
            });
            this.sendMessage(serverReadyMessage);
        }
        createMessage(message) {
            return Object.assign(Object.assign({}, message), { senderId: this.senderId });
        }
        wrapCallbackArgs(args) {
            return args.map(arg => {
                if (isCallbackArg(arg)) {
                    return (...callbackArgs) => {
                        const callbackMessage = this.createMessage({
                            messageType: "callbackMessage",
                            callbackId: arg.callbackId,
                            args: callbackArgs,
                            id: "noop",
                        });
                        this.sendMessage(callbackMessage);
                    };
                }
                return arg;
            });
        }
        sendMessage(message) {
            this.channel.sendMessage(JSON.stringify(message));
        }
        handleMessage(message) {
            return __awaiter(this, void 0, void 0, function* () {
                const parsedMessage = JSON.parse(message);
                if (parsedMessage.senderId === this.senderId)
                    return;
                if (parsedMessage.messageType === "clientReadyMessage") {
                    this.sendServerReadyMessage();
                }
                else if (parsedMessage.messageType === "invokeMessage") {
                    const { id, procedure, args: incomingArgs } = parsedMessage;
                    const wrappedArgs = this.wrapCallbackArgs(incomingArgs);
                    try {
                        const procedureFn = this.proceduresImplementation[procedure];
                        if (typeof procedureFn !== "function") {
                            throw new Error(`Procedure '${procedure}' is not a function`);
                        }
                        const result = yield procedureFn.bind(this.proceduresImplementation)(...wrappedArgs);
                        const resultMessage = this.createMessage({
                            messageType: "resultMessage",
                            id: id,
                            result: result,
                        });
                        this.sendMessage(resultMessage);
                    }
                    catch (error) {
                        const errorMessage = this.createMessage({
                            messageType: "errorMessage",
                            id: id,
                            error: `${error}`,
                        });
                        this.sendMessage(errorMessage);
                    }
                }
            });
        }
        cleanup() {
            this.channel.removeMessageListener(this.handleMessage);
        }
    }
    class Client {
        constructor(channel) {
            this.channel = channel;
            this._isConnected = false;
            this.onConnectHandler = null;
            this.procedures = {};
            this.callbacks = {};
            this.senderId = `client-${generateId()}`;
            this.channel.addMessageListener(message => this.handleMessage(message));
            this.sendClientReadyMessage();
        }
        createMessage(message) {
            return Object.assign(Object.assign({}, message), { senderId: this.senderId });
        }
        sendClientReadyMessage() {
            const connectMessage = this.createMessage({
                id: generateId(),
                messageType: "clientReadyMessage",
            });
            this.sendMessage(connectMessage);
        }
        sendMessage(message) {
            this.channel.sendMessage(JSON.stringify(message));
        }
        onConnect(handler) {
            this.onConnectHandler = handler;
            if (this.isConnected) {
                handler();
            }
        }
        get isConnected() {
            return this._isConnected;
        }
        get proxy() {
            return new Proxy({}, {
                get: (target, property) => {
                    return (...args) => {
                        const messageId = generateId();
                        const messageArgs = args.map((arg, i) => {
                            if (typeof arg === "function") {
                                const callbackId = `${messageId}-${i}`;
                                this.callbacks[callbackId] = arg;
                                return { type: "callback", callbackId };
                            }
                            return arg;
                        });
                        const message = this.createMessage({
                            messageType: "invokeMessage",
                            id: messageId,
                            procedure: property,
                            args: messageArgs,
                        });
                        this.sendMessage(message);
                        return new Promise(resolve => {
                            this.procedures[messageId] = resolve;
                        });
                    };
                },
            });
        }
        handleMessage(message) {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.senderId === this.senderId)
                return;
            switch (parsedMessage.messageType) {
                case "serverReadyMessage": {
                    const connected = !this._isConnected;
                    this._isConnected = true;
                    if (connected && this.onConnectHandler) {
                        this.onConnectHandler();
                    }
                    break;
                }
                case "resultMessage": {
                    const { id, result } = parsedMessage;
                    this.procedures[id](result);
                    delete this.procedures[id];
                    break;
                }
                case "errorMessage": {
                    const { id, error } = parsedMessage;
                    this.procedures[id](Promise.reject(new Error(error)));
                    break;
                }
                case "callbackMessage": {
                    const { callbackId, args } = parsedMessage;
                    this.callbacks[callbackId](...args);
                    break;
                }
            }
        }
        cleanup() {
            this.channel.removeMessageListener(this.handleMessage);
        }
    }

    exports.Client = Client;
    exports.Server = Server;

}));
//# sourceMappingURL=tango-rpc.js.map
