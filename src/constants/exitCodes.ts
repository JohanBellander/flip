export const ExitCode = {
  Success: 0,
  InvalidInput: 2,
  BlockingIssue: 3,
  InternalError: 4,
  UnsupportedSchema: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];


