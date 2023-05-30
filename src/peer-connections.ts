import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  // iceServers: [{ urls: "stun:stun.qq.com:3478" }],
  // iceServers: [{ urls: "stun:stun.miwifi.com:3478" }],
  // iceServers: [{ urls: "stun:stun.cloopen.com:3478" }],
};

function getChannelName(senderId: string) {
  return `webrtc_signals:sender_id:${senderId}`;
}

type ReceiverPresence = {
  answer?: RTCSessionDescriptionInit;
  candidates?: RTCIceCandidateInit[];
};

export async function initSender(senderId: string, stream: MediaStream) {
  const peerConnectionMap = new Map<string, RTCPeerConnection>();
  const candidateListMap = new Map<string, RTCIceCandidateInit[]>();
  const channel = supabase.channel(getChannelName(senderId), {
    config: {
      presence: {
        key: `sender:${senderId}`,
      },
    },
  });
  channel
    .on("presence", { event: "join" }, async (payload) => {
      const presence = payload.newPresences[payload.newPresences.length - 1];
      const { answer, candidates } = presence as ReceiverPresence;
      if (!answer && !candidates) {
        if (/receiver\:/.test(payload.key)) {
          await createOffer(payload.key);
        }
        return
      }
      if (candidates) {
        const peerConnection = peerConnectionMap.get(payload.key);
        if (peerConnection) {
          if (
            "stable" === peerConnection.signalingState &&
            "closed" !== peerConnection.connectionState
          ) {
            await addIceCandidate(payload.key, peerConnection, candidates);
          } else {
            candidateListMap.set(payload.key, candidates);
          }
        }
      }
      if (answer) {
        let peerConnection = peerConnectionMap.get(payload.key);
        if (peerConnection) {
          if ("stable" !== peerConnection.signalingState) {
            // peerConnection = await createOffer(payload.key);
            const remoteDesc = new RTCSessionDescription(answer);
            await peerConnection.setRemoteDescription(remoteDesc);
            addIceCandidate(payload.key, peerConnection, candidates);
          }
        }
      }
    })
    .subscribe(async () => {
      channel.track({});
    });

  async function addIceCandidate(
    key: string,
    peerConnection: RTCPeerConnection,
    candidates?: RTCIceCandidateInit[]
  ) {
    peerConnection = peerConnection || peerConnectionMap.get(key);
    candidates = candidates || candidateListMap.get(key);
    if (candidates) {
      for await (const candidate of candidates) {
        await peerConnection.addIceCandidate(candidate);
      }
      candidateListMap.delete(key);
    }
  }
  async function createOffer(key: string) {
    // close old peer connection
    peerConnectionMap.get(key)?.close();
    peerConnectionMap.delete(key);
    candidateListMap.delete(key);

    const peerConnection = new RTCPeerConnection(configuration);
    peerConnection.addEventListener("connectionstatechange", () => {
      if (peerConnection?.connectionState === "connected") {
        // debugger;
      }
    });
    stream.getTracks().forEach((track) => {
      peerConnection?.addTrack(track, stream);
    });
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    peerConnectionMap.set(key, peerConnection);
    channel.track({ offer });
    return peerConnection;
  }
}

export async function initReceiver(
  senderId: string,
  receiverId: string,
  onStream: (stream: MediaStream) => void
) {
  const channel = supabase.channel(getChannelName(senderId), {
    config: {
      presence: {
        key: `receiver:${receiverId}`,
      },
    },
  });
  let presence: ReceiverPresence;
  channel
    .on("presence", { event: "join" }, async (payload) => {
      const { offer } = payload.newPresences[payload.newPresences.length - 1];
      if (!offer) {
        return;
      }
      const peerConnection = new RTCPeerConnection(configuration);
      peerConnection.addEventListener("icecandidate", async (event) => {
        const candidate = event.candidate?.toJSON();
        if (!candidate) {
          return;
        }
        presence.candidates = presence.candidates || [];
        presence.candidates.push(candidate);
        await channel.track(presence);
      });
      peerConnection.addEventListener("connectionstatechange", () => {
        if (peerConnection?.connectionState === "connected") {
          // debugger;
        }
      });
      peerConnection.addEventListener("track", (event) => {
        const stream = event.streams[0];
        onStream(stream);
      });
      peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      presence.answer = { sdp: answer.sdp, type: answer.type };
      await channel.track(presence);
    })
    .subscribe(async () => {
      presence = {};
      await channel.track(presence);
    });
}
