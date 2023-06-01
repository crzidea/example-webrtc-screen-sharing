import { RealtimeChannel, createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
const stunUrl = import.meta.env.VITE_STUN_URL || "stun:stun.qq.com:3478";
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: -1,
    },
  },
});

const configuration = {
  // iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  // iceServers: [{ urls: "stun:stun.qq.com:3478" }],
  // iceServers: [{ urls: "stun:stun.miwifi.com:3478" }],
  iceServers: [{ urls: stunUrl }],
};

type SupabaseSignalingChannelEventMap = {
  join: {
    userId: string;
  };
  offer: RTCSessionDescriptionInit;
  answer: {
    userId: string;
    init: RTCSessionDescriptionInit;
  };
  candidates: {
    init: RTCIceCandidateInit[];
    userId?: string;
  };
};

declare type SupabaseSignalingChannelEvent<
  K extends keyof SupabaseSignalingChannelEventMap
> = CustomEvent<SupabaseSignalingChannelEventMap[K]> & {
  new (
    type: K,
    eventInitDict?: SupabaseSignalingChannelEventMap[K]
  ): SupabaseSignalingChannelEvent<K>;
};
const SupabaseSignalingChannelEvent = CustomEvent;

declare interface SupabaseSignalingChannel {
  addEventListener<K extends keyof SupabaseSignalingChannelEventMap>(
    type: K,
    callback: (event: SupabaseSignalingChannelEvent<K>) => void,
    options?: boolean | AddEventListenerOptions | undefined
  ): void;
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions | undefined
  ): void;
  dispatchEvent(
    event: SupabaseSignalingChannelEvent<keyof SupabaseSignalingChannelEventMap>
  ): boolean;
  dispatchEvent(event: Event): boolean;
}

class SupabaseSignalingChannel extends EventTarget {
  private roomChannel: RealtimeChannel;
  private userChannels: Map<string, RealtimeChannel> = new Map();
  private selfUserChannel?: RealtimeChannel;
  private roomId: string;
  private userId: string;
  constructor(roomId: string, userId?: string) {
    super();
    this.roomId = roomId;
    this.userId = userId || uuidv4();
    this.roomChannel = supabase.channel(this.roomChannelName(), {
      config: {
        presence: {
          key: this.userId,
        },
      },
    });
  }
  roomChannelName() {
    return `webrtc_signals:room:${this.roomId}`;
  }
  userChannelName(userId: string) {
    return `webrtc_signals:room:${this.roomId}:user:${userId}`;
  }
  async startStreaming() {
    this.roomChannel.on("presence", { event: "join" }, async (payload) => {
      console.log("presence join", payload);
      const { key: userId } = payload;
      if (this.userChannels.has(userId)) {
        this.dispatchEvent(
          new SupabaseSignalingChannelEvent("join", { detail: { userId } })
        );
        return;
      }
      const userChannel = supabase.channel(this.userChannelName(userId));
      userChannel.on("broadcast", { event: "answer" }, async (payload) => {
        const answer: RTCSessionDescriptionInit = payload.answer;
        this.dispatchEvent(
          new SupabaseSignalingChannelEvent("answer", {
            detail: { init: answer, userId },
          })
        );
      });
      userChannel.on("broadcast", { event: "candidates" }, async (payload) => {
        const candidates: RTCIceCandidateInit[] = payload.candidates;
        this.dispatchEvent(
          new SupabaseSignalingChannelEvent("candidates", {
            detail: { init: candidates, userId },
          })
        );
      });
      this.userChannels.set(userId, userChannel);
      await new Promise((resolve) => {
        userChannel.subscribe((result) => {
          resolve(result);
        });
      });
      this.dispatchEvent(
        new SupabaseSignalingChannelEvent("join", { detail: { userId } })
      );
    });
    await new Promise((resolve) => {
      this.roomChannel.subscribe(resolve);
    });
  }
  async sendOffer(userId: string, offer: RTCSessionDescriptionInit) {
    const userChannel = this.userChannels.get(userId);
    if (!userChannel) {
      throw new Error(`user channel not found: ${userId}`);
    }
    const result = await userChannel.send({
      type: "broadcast",
      event: "offer",
      offer,
    });
    return this.checkSendResult(result);
  }

  async startReceiving() {
    const userChannel = supabase.channel(this.userChannelName(this.userId));
    userChannel.on("broadcast", { event: "offer" }, async (payload) => {
      const offer: RTCSessionDescriptionInit = payload.offer;
      this.dispatchEvent(
        new SupabaseSignalingChannelEvent("offer", { detail: offer })
      );
    });
    userChannel.on("broadcast", { event: "candidates" }, async (payload) => {
      const candidates: RTCIceCandidateInit[] = payload.candidates;
      this.dispatchEvent(
        new SupabaseSignalingChannelEvent("candidates", {
          detail: { init: candidates },
        })
      );
    });
    this.selfUserChannel = userChannel;
    await new Promise((resolve) => {
      userChannel.subscribe(resolve);
    });
    await new Promise((resolve) => {
      this.roomChannel.subscribe(async () => {
        const result = await this.roomChannel.track({ userId: this.userId });
        resolve(result);
      });
    });
  }
  async sendAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.selfUserChannel) {
      throw new Error(`self user channel not found`);
    }
    const result = await this.selfUserChannel.send({
      type: "broadcast",
      event: "answer",
      answer,
    });
    return this.checkSendResult(result);
  }
  async sendCandidate(candidates: RTCIceCandidateInit[], userId?: string) {
    let userChannel: RealtimeChannel | undefined;
    if (userId) {
      userChannel = this.userChannels.get(userId);
      if (!userChannel) {
        throw new Error(`user channel not found: ${userId}`);
      }
    } else {
      userChannel = this.selfUserChannel;
      if (!userChannel) {
        throw new Error(`self user channel not found`);
      }
    }
    const result = await userChannel.send({
      type: "broadcast",
      event: "candidates",
      candidates: candidates,
    });
    return this.checkSendResult(result);
  }
  checkSendResult(result: string) {
    if ("ok" !== result) {
      throw new Error(`failed to send: ${result}`);
    }
    return result;
  }
}

function createAddIceCandidateContext() {
  const candidatesMap = new Map<RTCPeerConnection, RTCIceCandidateInit[]>();
  return async function addIceCandidate(
    peerConnection: RTCPeerConnection,
    candidates?: RTCIceCandidateInit[]
  ) {
    const _candidates = candidatesMap.get(peerConnection) || [];
    if (candidates) {
      _candidates.push(...candidates);
    }
    if ("stable" !== peerConnection.signalingState) {
      candidatesMap.set(peerConnection, _candidates);
      return;
    }
    if (!_candidates.length) {
      return;
    }
    candidatesMap.delete(peerConnection);
    const promises = _candidates.map((candidate) =>
      peerConnection.addIceCandidate(candidate)
    );
    await Promise.all(promises);
  };
}

function collectAndSendCandicates(
  peerConnection: RTCPeerConnection,
  channel: SupabaseSignalingChannel,
  userId?: string
) {
  const CANDICATES_WAIT_TIME = 100;
  let candidates: RTCIceCandidateInit[] = [];
  let timer: NodeJS.Timeout;

  async function sendCandidates() {
    if (!candidates.length) {
      return;
    }
    console.log("send candidates", candidates);
    channel.sendCandidate(candidates, userId);
    candidates = [];
  }
  peerConnection.addEventListener("icecandidate", async (event) => {
    const candidate = event.candidate?.toJSON();
    if (!candidate) {
      console.log("icecandidate end");
      await sendCandidates();
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(async () => {
      clearTimeout(timer);
      await sendCandidates();
    }, CANDICATES_WAIT_TIME);

    console.log("icecandidate", candidate);
    candidates.push(candidate);
  });
}

export async function startStreaming(roomId: string, stream: MediaStream) {
  const channel = new SupabaseSignalingChannel(roomId);
  const peerConnectionMap = new Map<string, RTCPeerConnection>();
  const addIceCandidate = createAddIceCandidateContext();
  channel.addEventListener("join", async (event) => {
    const { userId } = event.detail;
    // close old peer connection
    peerConnectionMap.get(userId)?.close();
    peerConnectionMap.delete(userId);

    const peerConnection = new RTCPeerConnection(configuration);
    peerConnection.addEventListener("connectionstatechange", async () => {
      console.log(
        "sender connectionstatechange",
        peerConnection.connectionState
      );
      if ("disconnected" === peerConnection.connectionState) {
        peerConnection.close();
        peerConnectionMap.delete(userId);
      }
    });
    collectAndSendCandicates(peerConnection, channel, userId);
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    peerConnectionMap.set(userId, peerConnection);
    await channel.sendOffer(userId, offer);
  });

  channel.addEventListener("answer", async (event) => {
    console.log("sender receive answer", event.detail);
    const init: RTCSessionDescriptionInit = event.detail.init;
    const userId = event.detail.userId;
    const peerConnection = peerConnectionMap.get(userId);
    if (!peerConnection) {
      throw new Error("peer connection not found");
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(init));
    await addIceCandidate(peerConnection);
  });

  channel.addEventListener("candidates", async (event) => {
    const init: RTCIceCandidateInit[] = event.detail.init;
    console.log("sender receive candidate", init);
    const userId = event.detail.userId;
    if (!userId) {
      throw new Error("userId not found");
    }
    const peerConnection = peerConnectionMap.get(userId);
    if (!peerConnection) {
      throw new Error("peer connection not found");
    }
    await addIceCandidate(peerConnection, init);
  });

  await channel.startStreaming();
}

export async function startReceiving(
  roomId: string,
  userId: string,
  onStream: (stream: MediaStream) => void
) {
  const addIceCandidate = createAddIceCandidateContext();
  const channel = new SupabaseSignalingChannel(roomId, userId);
  const peerConnection = new RTCPeerConnection(configuration);
  collectAndSendCandicates(peerConnection, channel);
  peerConnection.addEventListener("connectionstatechange", () => {
    console.log(
      "receiver connectionstatechange",
      peerConnection.connectionState
    );
  });
  peerConnection.addEventListener("track", (event) => {
    const [stream] = event.streams;
    onStream(stream);
  });

  channel.addEventListener("offer", async (event) => {
    console.log("receiver receive offer", event.detail);
    const offer = event.detail;
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await channel.sendAnswer(answer);
    await addIceCandidate(peerConnection);
  });
  channel.addEventListener("candidates", async (event) => {
    const candidates = event.detail.init;
    console.log("receiver receive candidate", candidates);
    await addIceCandidate(peerConnection, candidates);
  });
  await channel.startReceiving();
}
