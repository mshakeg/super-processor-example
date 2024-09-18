import { EventEmitter } from "events";

// we require this to listen for and intercept error's in the GRPC client
export const errorEmitter = new EventEmitter();
