import winston from "winston";

const defaultLevel = "info";

export const createLogger = ({ level = defaultLevel }: { level?: string }) =>
  winston.createLogger({
    level,
    transports: [new winston.transports.Console()],
  });
