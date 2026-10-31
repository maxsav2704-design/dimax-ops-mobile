export class ApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}

// The server did not answer in time: unlike a missing connection, the request may have reached it.
export class RequestTimeoutError extends NetworkError {
  constructor() {
    super("Request timed out");
    this.name = "RequestTimeoutError";
  }
}

export class SessionChangedError extends Error {
  constructor() {
    super("Mobile session changed while the request was in progress");
    this.name = "SessionChangedError";
  }
}

export class SessionStorageError extends Error {
  constructor() {
    super("Could not remove the saved sign-in data from this device");
    this.name = "SessionStorageError";
  }
}
