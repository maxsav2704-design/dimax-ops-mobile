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

export class SessionChangedError extends Error {
  constructor() {
    super("Mobile session changed while the request was in progress");
    this.name = "SessionChangedError";
  }
}
