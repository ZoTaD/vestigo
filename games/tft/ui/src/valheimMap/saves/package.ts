// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Saves/PackageReader.cs y SaveCompression.cs
/**
 * El `ZPackage` del juego: un `BinaryWriter` de .NET sobre memoria, así que
 * cada primitiva es la de `BinaryReader` (little-endian). Lo usan todos los
 * archivos de la partida; el `.db2` y los `.chunk` son el mismo formato sin
 * envoltorio.
 */
import { gunzip } from "./inflate";

const UTF8 = new TextDecoder("utf-8");

export class PackageReader {
  readonly buf: Uint8Array;
  private readonly view: DataView;
  private readonly start: number;
  private readonly end: number;
  /** Posición absoluta dentro de `buf`. */
  pos: number;

  constructor(data: Uint8Array, offset = 0, count = data.length - offset) {
    if (offset < 0 || count < 0 || offset + count > data.length) throw new RangeError("paquete fuera de rango");
    this.buf = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.start = offset;
    this.end = offset + count;
    this.pos = offset;
  }

  /** Bytes leídos desde el principio de este paquete. */
  get position(): number { return this.pos - this.start; }
  get length(): number { return this.end - this.start; }
  get remaining(): number { return this.end - this.pos; }

  /** Avanza `n` bytes y devuelve dónde empezaban (con control de límite). */
  take(n: number): number {
    if (n < 0 || n > this.end - this.pos) {
      throw new RangeError(`paquete truncado: faltan ${n} bytes en ${this.position}, quedan ${this.remaining}`);
    }
    const p = this.pos;
    this.pos += n;
    return p;
  }

  readByte(): number { return this.buf[this.take(1)]; }
  readBool(): boolean { return this.buf[this.take(1)] !== 0; }
  readShort(): number { return this.view.getInt16(this.take(2), true); }
  readUShort(): number { return this.view.getUint16(this.take(2), true); }
  readInt(): number { return this.view.getInt32(this.take(4), true); }
  readUInt(): number { return this.view.getUint32(this.take(4), true); }
  /** int64 como bigint: los uid de mundo y los id de jugador no entran en un double. */
  readLong(): bigint { return this.view.getBigInt64(this.take(8), true); }
  /** Si el int64 no es cero, sin armar un bigint (lo más común al recorrer ZDO). */
  readLongNonZero(): boolean { const p = this.take(8); return this.view.getInt32(p, true) !== 0 || this.view.getInt32(p + 4, true) !== 0; }
  readSingle(): number { return this.view.getFloat32(this.take(4), true); }
  readDouble(): number { return this.view.getFloat64(this.take(8), true); }

  /** `ReadByteArray()`: int32 de largo y esos bytes (una vista, no una copia). */
  readByteArray(): Uint8Array {
    const n = this.readInt();
    if (n < 0) throw new RangeError(`largo negativo ${n} en ${this.position}`);
    return this.readBytes(n);
  }
  readBytes(n: number): Uint8Array { const p = this.take(n); return this.buf.subarray(p, p + n); }

  /**
   * `BinaryWriter.Write(string)`: largo en bytes UTF-8 como entero de 7 bits
   * (LEB128, 1 a 5 bytes) y después los bytes.
   */
  readString(): string {
    const n = this.read7BitInt();
    if (n === 0) return "";
    const p = this.take(n);
    return UTF8.decode(this.buf.subarray(p, p + n));
  }
  /** Saltea un string sin decodificarlo. */
  skipString(): void { this.take(this.read7BitInt()); }

  /** `ReadVector3`: x, y, z. */
  readVector3(): [number, number, number] { return [this.readSingle(), this.readSingle(), this.readSingle()]; }

  /** `Read(ZPackage)`: int32 de largo y un paquete adentro. */
  readPackage(): PackageReader {
    const n = this.readInt();
    if (n < 0) throw new RangeError(`largo de paquete negativo ${n}`);
    const p = this.take(n);
    return new PackageReader(this.buf, p, n);
  }

  /** `ReadCompressedPackage()`: int32 de largo y un gzip (`Utils.Compress`) con el paquete. */
  readCompressedPackage(): PackageReader {
    return new PackageReader(gunzip(this.readByteArray()));
  }

  /** `ReadNumItems`: un byte, o dos si el primero tiene el bit alto (máximo 32767). */
  readNumItems(): number {
    let b = this.readByte();
    if (b & 0x80) b = ((b & 0x7f) << 8) | this.readByte();
    return b;
  }

  /** Un conteo que no puede pedir más de lo que queda (`bytesPerItem` por elemento, como mínimo). */
  readCount(what: string, bytesPerItem = 1): number {
    const n = this.readInt();
    if (n < 0 || n * bytesPerItem > this.remaining) throw new RangeError(`cantidad imposible de ${what}: ${n}`);
    return n;
  }

  /** Falla si sobran bytes: una lectura correcta consume el bloque justo. */
  expectEnd(what: string): void {
    if (this.remaining !== 0) throw new RangeError(`${what}: sobran ${this.remaining} bytes`);
  }

  private read7BitInt(): number {
    let result = 0;
    for (let i = 0, shift = 0; i < 5; i++, shift += 7) {
      const b = this.readByte();
      if (i === 4 && (b & 0xf0) !== 0) throw new RangeError("entero de 7 bits mal formado");
      result |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return result;
    }
    throw new RangeError("entero de 7 bits mal formado");
  }
}
