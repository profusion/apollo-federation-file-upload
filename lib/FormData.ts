import BaseFormData from 'form-data';

export default class FormData extends BaseFormData {
  /*
    This is a workaround to make node-fetch to work properly
    with unknown length streams, which was not released yet.
    https://github.com/node-fetch/node-fetch/pull/707
   */
  getLength(callback: (err: Error | null, length: number) => void): void {
    const cb = (err: Error | null, length: number): void => {
      if (err || !Number.isNaN(length)) {
        callback(err, length);
      } else {
        callback(null, null as unknown as number);
      }
    };
    super.getLength(cb);
  }

  getLengthSync(): number {
    const len = super.getLengthSync();
    return Number.isNaN(len) ? (null as unknown as number) : len;
  }
}
