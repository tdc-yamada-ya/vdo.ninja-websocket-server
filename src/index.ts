import { WebSocket, RawData, WebSocketServer } from "ws";
import { createLogger } from "./createLogger";

const envPort = process.env.PORT;
const envLogLevel = process.env.LOG_LEVEL;

const logger = createLogger({ level: envLogLevel });

const port = parseInt(envPort || "8080");
const webSocketServer = new WebSocketServer({
  port: parseInt(envPort || "8080"),
});

webSocketServer.on("listening", () =>
  logger.info(`Server started on port ${port}`)
);

type Client = {
  id: string;
  socket: WebSocket;
};

interface Room {
  id: string;
  addClient(client: Client): void;
  removeClient(client: Client): void;
  broadcast(data: string, filter: (client: Client) => boolean): void;
}

const createRoom = (id: string): Room => {
  const map = new Map<string, Client>();

  return {
    id,
    addClient(client) {
      map.set(client.id, client);
    },
    removeClient(client) {
      map.delete(client.id);
    },
    broadcast(data, filter) {
      const cc = Array.from(map.values()).filter(filter);
      logger.debug(`broadcast to ${cc.map((c) => c.id).join(", ")}`);
      cc.forEach((c) => c.socket.send(data));
    },
  };
};

interface Space {
  room(id: string): Room;
}

const createSpace = (): Space => {
  const map = new Map<string, Room>();

  return {
    room(id) {
      const r = map.get(id);
      if (r) {
        return r;
      }

      const r2 = createRoom(id);
      map.set(id, r2);
      return r2;
    },
  };
};

const space = createSpace();

const decodeData = (data: RawData) =>
  Array.isArray(data) ? data.map((e) => e.toString()) : [data.toString()];

const tryParseJSON = (s: string) => {
  try {
    return {
      result: JSON.parse(s),
      error: null,
    };
  } catch (err) {
    return {
      result: null,
      error: err,
    };
  }
};

type JoinRoomRequest = {
  request: "joinroom";
  roomid?: string;
};

const isJoinRoomRequest = (m: any): m is JoinRoomRequest =>
  m.request === "joinroom";

const createClientIdGenerator = (): (() => string) => {
  let seq = 0n;
  return () => {
    seq += 1n;
    return seq.toString();
  };
};

const clientIdGenerator = createClientIdGenerator();

const tryProcess = (callback: () => void) => {
  try {
    callback();
  } catch (err) {
    logger.error(`error: ${JSON.stringify(err)}`);
  }
};

const onConnection = (socket: WebSocket) => {
  let client = {
    id: clientIdGenerator(),
    socket,
  };
  let currentRoom: Room | null = null;

  const processDataAsMessage = (data: string) => {
    const { result: message } = tryParseJSON(data);

    if (isJoinRoomRequest(message)) {
      processJoinRoomRequest(message);
    }
  };

  const processJoinRoomRequest = (r: JoinRoomRequest) => {
    logger.info(
      `Process joinroom request - currentRoom.id: ${currentRoom?.id}, client.id: ${client.id}, roomid: ${r.roomid}`
    );

    if (currentRoom) {
      currentRoom.removeClient(client);
    }

    if (!r.roomid) {
      return;
    }

    const room = space.room(r.roomid);
    room.addClient(client);
    currentRoom = room;
  };

  const isSelfClient = (c: Client) => c.id === client.id;

  const broadcast = (data: string) =>
    currentRoom?.broadcast(data, (c) => !isSelfClient(c));

  const out = () => currentRoom?.removeClient(client);

  const processData = (data: RawData) => {
    decodeData(data).forEach((data) => {
      console.debug(
        `client.id: ${client.id}, currentRoom.id: ${currentRoom?.id}, data: ${data}`
      );

      processDataAsMessage(data);
      broadcast(data);
    });
  };

  socket.on("message", (data) => tryProcess(() => processData(data)));
  socket.on("close", () => tryProcess(() => out()));
};

const onError = (err: Error) =>
  console.log(`Websocket server error - ${JSON.stringify(err)}`);

webSocketServer.on("connection", (socket) =>
  tryProcess(() => onConnection(socket))
);
webSocketServer.on("error", (err) => tryProcess(() => onError(err)));

const exit = () => {
  webSocketServer.close();
  process.exit(0);
};

process.on("SIGINT", exit);
process.on("SIGTERM", exit);
