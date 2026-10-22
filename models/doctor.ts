/**
 * `todo` can be fixed by setup; `problem` needs a person to look at it;
 * `notice` is worth knowing but never makes doctor fail.
 */
export type CheckStatus = 'ok' | 'todo' | 'problem' | 'notice';

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  /** What setup will do about a `todo`; empty otherwise. */
  fix: string;
}
