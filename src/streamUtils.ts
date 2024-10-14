// Convert stream to buffer
export async function streamToBuffer(stream: Blob | ReadableStream | NodeJS.ReadableStream): Promise<Buffer> {
  if (stream instanceof ReadableStream) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) {
        done = true;
      } else if (value) {
        chunks.push(value);
      }
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  } else if (stream instanceof Blob) {
    return Buffer.from(await stream.arrayBuffer());
  } else {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: any[] = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }
}
