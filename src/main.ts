import "./style.css";
import {
  getStreamFromCamera,
  getStreamFromDisplayMedia,
  getStreamFromElectron,
  playVideoWithStream,
} from "./media-devices";
import { startReceiving, startStreaming } from "./peer-connections";

async function main() {
  const matches = document.location.hash.match(/^\#\/(sender|receiver)\//);
  const role = matches ? matches[1] : "sender";

  if ("receiver" === role) {
    // Get sender id and receiver id from hash
    const matches = document.location.hash.match(/^\#\/receiver\/(.*)\/(.*)$/);
    if (!matches) {
      throw new Error("Receiver id and sender id not found in URL hash");
    }
    const roomId = matches[1];
    const receiverId = matches[2];
    startReceiving(roomId, receiverId, playVideoWithStream);
  } else {
    // Get sender id from hash
    const matches = document.location.hash.match(/^\#\/sender\/(.*)$/);
    if (!matches) {
      throw new Error("Sender id not found in URL hash");
    }
    const roomId = matches[1];
    let stream;
    const MEDIA_STREAM = import.meta.env.VITE_MEDIA_STREAM;
    if ("display" === MEDIA_STREAM) {
      if (/ Electron\//.test(navigator.userAgent)) {
        stream = await getStreamFromElectron()
      } else {
        stream = await getStreamFromDisplayMedia();
      }
    } else {
      stream = await getStreamFromCamera();
    }
    // playVideoWithStream(stream);
    startStreaming(roomId, stream);
  }
}
main();
