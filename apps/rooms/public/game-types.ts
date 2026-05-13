export type GameId = string;

export type GameRecord = {
  id: GameId;
  createdAt: number;
};

export type PlayerRecord = {
  id: string;
  name: string;
};

export type CreateGameResponse = {
  gameId: GameId;
  url: string;
};

export type GetGameResponse = {
  gameId: GameId;
  createdAt: number;
};

export type JoinGameResponse = {
  ok: true;
  gameId: GameId;
};
