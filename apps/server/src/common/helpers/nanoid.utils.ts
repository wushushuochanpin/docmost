import { randomInt } from 'node:crypto';

function customAlphabet(alphabet: string, defaultSize: number) {
  return (size = defaultSize) => {
    let id = '';

    for (let index = 0; index < size; index++) {
      id += alphabet[randomInt(alphabet.length)];
    }

    return id;
  };
}

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
export const nanoIdGen = customAlphabet(alphabet, 10);

const slugIdAlphabet =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const generateSlugId = customAlphabet(slugIdAlphabet, 10);
