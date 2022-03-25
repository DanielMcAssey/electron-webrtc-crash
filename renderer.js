// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

var captureBtn = document.getElementById("captureBtn");

var sourceVideo = document.querySelector('#source');
var outputVideo = document.querySelector('#output');

captureBtn.addEventListener('click', function(e) {
    window
        .electron
        .getMediaSourceId()
        .then((mediaSourceId) => {
            // Capture the window
            doCapture(mediaSourceId);
        });
});

async function doCapture(mediaSourceId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: mediaSourceId,
        }
      }
    });

    const video = document.querySelector('video');
    video.srcObject = stream;
    video.onloadedmetadata = (e) => video.play();

    const track = stream.getTracks()[0];
    startPeerConnection(track);
  } catch (e) {
    console.error(e);
  }
}

async function startPeerConnection(track) {
    console.log(track);
    const sendStream = new MediaStream();

    window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection ||
                               window.mozRTCPeerConnection;

    var yourConnection = new RTCPeerConnection();
    var theirConnection = new RTCPeerConnection();

    window.yourConnection = yourConnection;

    theirConnection.onaddstream = function(e) {
        outputVideo.srcObject = e.stream;
    };

    yourConnection.onicecandidate = function (event) {
        if (event.candidate) {
            theirConnection.addIceCandidate(new RTCIceCandidate(event.candidate));
        }
    };

    theirConnection.onicecandidate = function (event) {
        if (event.candidate) {
            yourConnection.addIceCandidate(new RTCIceCandidate(event.candidate));
        }
    }

    // enable simulcast encodings
    // the receiver should by default get the first encoding (half size)

    const encodings = [
      {rid: 'r0', scalabilityMode: 'S1T3', scaleResolutionDownBy: 2, maxBitrate: 300000},
      {rid: 'r1', scalabilityMode: 'S1T3', scaleResolutionDownBy: 1, maxBitrate: 600000},
    ];

    const transceiver = yourConnection.addTransceiver(track, {
      direction: 'sendonly',
      streams: [sendStream],
      //sendEncodings: encodings
    });

    yourConnection.createOffer(function (offer) {
        // enable simulcast
        const res = window.electron.sdpTransform.parse(offer.sdp);
        let media = res.media[0];

        media.fmtp = [{payload: 125, config: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"}, {payload: 107, config: "apt=125"}];
        media.rtcpFb = [
          {payload: 125, type: "goog-remb"},
          {payload: 125, type: "transport-cc"},
          {payload: 125, type: "ccm", subtype: "fir"},
          {payload: 125, type: "nack"},
          {payload: 125, type: "nack", subtype: "pli"}
        ];
        media.rtp = [{payload: 125, codec: "VP8", rate: 90000}, {payload: 107, codec: "rtx", rate: 90000}];

        offer.sdp = window.electron.sdpTransform.write(res);

        console.log('your SDP', offer.sdp);

        yourConnection.setLocalDescription(offer);
        theirConnection.setRemoteDescription(offer);

        theirConnection.createAnswer(function (offer) {

            // force VP8 for theirConnection
            const res = window.electron.sdpTransform.parse(offer.sdp);
            let media = res.media[0];

            media.fmtp = [{payload: 125, config: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"}, {payload: 107, config: "apt=125"}];
            media.rtcpFb = [
              {payload: 125, type: "goog-remb"},
              {payload: 125, type: "transport-cc"},
              {payload: 125, type: "ccm", subtype: "fir"},
              {payload: 125, type: "nack"},
              {payload: 125, type: "nack", subtype: "pli"}
            ];
            media.rtp = [{payload: 125, codec: "VP8", rate: 90000}, {payload: 107, codec: "rtx", rate: 90000}];

            offer.sdp = window.electron.sdpTransform.write(res);

            console.log('their SDP', offer.sdp);

            theirConnection.setLocalDescription(offer);
            yourConnection.setRemoteDescription(offer);
        }, function (error) {
            console.log(error);
        });
    }, function (error) {
        console.log(error);
    });
}

