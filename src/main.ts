import "./style.css";

// Updates the select element with the provided set of cameras
function updateCameraList(cameras: MediaDeviceInfo[]) {
  const listElement = document.querySelector<HTMLSelectElement>(
    "select#availableCameras"
  );
  if (listElement === null) {
    throw new Error("camera list element not found");
  }
  listElement.innerHTML = "";
  for (const camera of cameras) {
    const cameraOption = document.createElement("option");
    cameraOption.label = camera.label;
    cameraOption.value = camera.deviceId;
    listElement.add(cameraOption);
  }
}

// Fetch an array of devices of a certain type
async function getConnectedDevices(type: string) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === type);
}

// Get the initial set of cameras connected
const videoCameras = await getConnectedDevices("videoinput");
updateCameraList(videoCameras);

// Listen for changes to media devices and update the list accordingly
navigator.mediaDevices.addEventListener("devicechange", async () => {
  const newCameraList = await getConnectedDevices("video");
  updateCameraList(newCameraList);
});

// Open camera with at least minWidth and minHeight capabilities
async function openCamera(
  cameraId: string,
  minWidth: number,
  minHeight: number
) {
  const constraints = {
    audio: { echoCancellation: true },
    video: {
      deviceId: cameraId,
      width: { min: minWidth },
      height: { min: minHeight },
    },
  };

  return await navigator.mediaDevices.getUserMedia(constraints);
}

async function playVideoFromStream(stream: MediaProvider) {
  const videoElement =
    document.querySelector<HTMLVideoElement>("video#localVideo");
  if (!videoElement) {
    return;
  }
  videoElement.srcObject = stream;
}

async function getStreamFromCamera() {
  const cameras = await getConnectedDevices("videoinput");
  if (!cameras.length) {
    throw new Error("No camera available");
  }
  // Open first available video camera with a resolution of 1280x720 pixels
  const stream = await openCamera(cameras[0].deviceId, 1280, 720);
  return stream;
}

async function getStreamFromDisplayMedia() {
  const stream = await navigator.mediaDevices.getDisplayMedia();
  return stream;
}

// const stream = await getStreamFromCamera();
// const stream = await getStreamFromDisplayMedia();
// playVideoFromStream(stream)