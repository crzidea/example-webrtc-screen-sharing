import "./style.css";
import { getStreamFromCamera, getStreamFromDisplayMedia, playVideoWithStream } from "./media-devices";
import { initReceiver, initSender } from "./peer-connections";

const matches = document.location.hash.match(/^\#\/(sender|receiver)\//);
const role = matches ? matches[1] : "sender";
if ("receiver" === role) {
  // Get sender id and receiver id from hash
  const matches = document.location.hash.match(/^\#\/receiver\/(.*)\/(.*)$/);
  if (!matches) {
    throw new Error("Receiver id and sender id not found in URL hash");
  }
  const senderId = matches[1];
  const receiverId = matches[2];
  initReceiver(senderId, receiverId, playVideoWithStream);
} else {
  // Get sender id from hash
  const matches = document.location.hash.match(/^\#\/sender\/(.*)$/);
  if (!matches) {
    throw new Error("Sender id not found in URL hash");
  }
  const senderId = matches[1];
  const stream = await getStreamFromCamera();
  // const stream = await getStreamFromDisplayMedia();
  playVideoWithStream(stream);
  initSender(senderId, stream);
}
