// Encapsulate variables within the p5 prototype

//Touch

/**
 * Sets up touch event handling by disabling default touch behaviors and preventing unwanted interactions.
 * This includes disabling text selection, context menus, and other default touch gestures.
 * @method setupTouchSensor
 * @example
 * function setup() {
 *   setupTouchSensor();
 * }
 */

p5.prototype.setupTouchSensor = function(options = {}) {
  // Set default options
  const defaults = {
    disableGestures: false,
    disableSelection: true, 
    disableContextMenu: true,
    disableHighlighting: true,
    disableLongPressZoom: true
  };

  // Merge provided options with defaults
  const settings = {...defaults, ...options};

  // Disable touch gestures like zooming and panning
  if (settings.disableGestures) {
    this.disableTouchGestures();
  }

  // Prevent text selection on the page
  if (settings.disableSelection) {
    this.disableTextSelection();
  }

  // Prevent the context menu (right-click) from appearing anywhere
  if (settings.disableContextMenu) {
    this.disableContextMenu();
  }

  // Prevent text selection
  if (settings.disableHighlighting) {
    this.disableTextHighlighting();
  }

  if (settings.disableLongPressZoom){
    this.disableLongPressZoom();
  }

  
}

/**
 * Disables touch gestures like zooming and panning while allowing touch actions on buttons
 * @method disableTouchGestures
 * @private
 */
p5.prototype.disableTouchGestures = function() {
  document.body.style.touchAction = "manipulation";
};

/**
 * Prevents text selection on the page
 * @method disableTextSelection
 * @private
 */
p5.prototype.disableTextSelection = function() {
  document.body.style.userSelect = "none";
};

/**
 * Prevents the context menu (right-click) from appearing
 * @method disableContextMenu
 * @private
 */
p5.prototype.disableContextMenu = function() {
  document.addEventListener("contextmenu", (event) => event.preventDefault());
};

/**
 * Prevents text highlighting/selection
 * @method disableTextHighlighting
 * @private
 */
p5.prototype.disableTextHighlighting = function() {
  document.addEventListener("selectstart", (event) => event.preventDefault());
};

/**
 * Prevents zoom lens popup
 * @method disableLongPressZoom
 * @private
 */
p5.prototype.disableLongPressZoom = function() {

  document.body.style.userSelect = 'none';            // Standard
  document.body.style.webkitUserSelect = 'none';      // iOS/Chrome on iOS
  document.body.style.webkitTouchCallout = 'none';    // iOS callout (copy/paste)

  document.addEventListener('touchstart', function (event) {
    // Call your custom function
    touchStarted(event);
  }, { passive: false });
};


/**
 * Checks if the sensor permission has been granted.
 * @method isSensorPermissionGranted
 * @return {boolean} True if the sensor permission is granted, false otherwise.
 */
p5.prototype.isSensorPermissionGranted = function() {
  return this._sensorPermissionGranted;
};

/**
 * @property {boolean} _sensorPermissionGranted - Indicates whether device motion/orientation sensor access is allowed
 * @private 
 */
p5.prototype._sensorPermissionGranted = false;

/**
 * @property {Object|null} _accelerationWithGravity
 * @private
 */
p5.prototype._accelerationWithGravity = null;

/**
 * @property {Object|null} _acceleration
 * @private
 */
p5.prototype._acceleration = null;

/**
 * @property {Object|null} _rotation
 * @private
 */
p5.prototype._rotation = null;

/**
 * @property {Object|null} _orientation
 * @private
 */
p5.prototype._orientation = null;

/**
 * @property {Object|null} _absoluteOrientation
 * @private
 */
p5.prototype._absoluteOrientation = null;

// Add p5 prototype variables for gravity, orientation, and absolute orientation
/**
 * @property {number} gravityX
 * @readOnly
 */
p5.prototype.gravityX = 0;

/**
 * @property {number} gravityY
 * @readOnly
 */
p5.prototype.gravityY = 0;

/**
 * @property {number} gravityZ
 * @readOnly
 */
p5.prototype.gravityZ = 0;

/**
 * @property {number} orientationX
 * @readOnly
 */
p5.prototype.orientationX = 0;

/**
 * @property {number} orientationY
 * @readOnly
 */
p5.prototype.orientationY = 0;

/**
 * @property {number} orientationZ
 * @readOnly
 */
p5.prototype.orientationZ = 0;

/**
 * @property {number} absoluteOrientationX
 * @readOnly
 */
p5.prototype.absoluteOrientationX = 0;

/**
 * @property {number} absoluteOrientationY
 * @readOnly
 */
p5.prototype.absoluteOrientationY = 0;

/**
 * @property {number} absoluteOrientationZ
 * @readOnly
 */
p5.prototype.absoluteOrientationZ = 0;

/*
Motion Sensors
*/

/**
 * Sets up motion sensors by checking for necessary permissions.
 * @method setupMotionSensor
 */
p5.prototype.setupMotionSensor = function() {
    this.checkSensorPermission();
};

/**
 * Checks if the device needs permission for motion sensors and requests it if necessary.
 * @method checkSensorPermission
 * @private
 */
p5.prototype.checkSensorPermission = function() {
    const needsPermissions = (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent?.requestPermission === "function") ||
                            (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent?.requestPermission === "function");

    if (needsPermissions) {
        Promise.all([
            DeviceOrientationEvent?.requestPermission?.() || Promise.resolve(),
            DeviceMotionEvent?.requestPermission?.() || Promise.resolve()
        ]).catch(() => {
            let button = createButton("Allow Sensors")
                .id("sensorPermissionButton")
                .style("font-size", "24px")
                .center()
                .mousePressed(this.requestSensorAccess.bind(this));
            //throw new Error("Sensor permission required");
        }).then(() => {
            this._sensorPermissionGranted = true;
            window.addEventListener("deviceorientation", this.updateOrientation.bind(this), true);
            window.addEventListener("deviceorientationabsolute", this.updateOrientation.bind(this), true);
            window.addEventListener("devicemotion", this.updateMotion.bind(this), true);
        });
    } else {
        this._sensorPermissionGranted = true;
        window.addEventListener("deviceorientation", this.updateOrientation.bind(this), true);
        window.addEventListener("deviceorientationabsolute", this.updateOrientation.bind(this), true);
        window.addEventListener("devicemotion", this.updateMotion.bind(this), true);
    }
};


/**
 * Handles the sensor permission request.
 * @method requestSensorAccess
 * @private
 */
p5.prototype.requestSensorAccess = function() {
    // Request permission from the user
    Promise.all([
      DeviceOrientationEvent.requestPermission(),
      DeviceMotionEvent.requestPermission()
    ]).then(([orientationResponse, motionResponse]) => {
      // If both permissions are granted, set _sensorPermissionGranted to true
      if (orientationResponse === "granted" && motionResponse === "granted") {
        this._sensorPermissionGranted = true;
      } else {
        // If either permission is denied, keep it false
        this._sensorPermissionGranted = false;
      }
    })
    .catch(console.error); // Log errors to the console
  
    // Remove the button after the user interacts with it
    select("#sensorPermissionButton").remove();
};


/* p5 default motion variables
let accelerationX;
let accelerationY;
let accelerationZ;
let rotationX;
let rotationY;
let rotationZ;
*/

/**
 * Updates orientation data from device sensors.
 * @method updateOrientation
 * @param {DeviceOrientationEvent} event - The orientation event containing sensor data.
 * @private
 */
p5.prototype.updateOrientation = function(event) {
  // Handle regular DeviceOrientationEvent
  if (!event.absolute) {
    let orientX = event.beta;    // x-axis rotation [-180,180]
    let orientY = event.gamma;   // y-axis rotation [-90,90]
    let orientZ = event.alpha;   // z-axis rotation [0,360)
    
    // Use p5.js deviceOrientation
    if (deviceOrientation === 'landscape') {
      orientX = event.gamma;
      orientY = -event.beta;
    } else if (deviceOrientation === 'portrait') {
      orientX = event.beta;
      orientY = event.gamma;
    } else {
      // Default or unknown orientation
      orientX = event.beta;
      orientY = event.gamma;
    }

    this._orientation = {
      x: orientX,
      y: orientY,
      z: orientZ,
      alpha: orientZ,
      beta: orientX,
      gamma: orientY
    };
    
    this._setProperty('orientationX', orientX);
    this._setProperty('orientationY', orientY);
    this._setProperty('orientationZ', orientZ);
  }
  // Handle Absolute Orientation
  else {
    let absOrientX = event.beta;
    let absOrientY = event.gamma;
    let absOrientZ = event.alpha;
    
    // Adjust values based on screen orientation
    if (deviceOrientation === 'landscape') {
      absOrientX = event.gamma;
      absOrientY = -event.beta;
    } else if (deviceOrientation === 'portrait') {
      absOrientX = -event.gamma;
      absOrientY = event.beta;
    }

    this._absoluteOrientation = {
      x: absOrientX,
      y: absOrientY,
      z: absOrientZ,
      alpha: absOrientZ,
      beta: absOrientX,
      gamma: absOrientY
    };
    
    this._setProperty('absoluteOrientationX', absOrientX);
    this._setProperty('absoluteOrientationY', absOrientY);
    this._setProperty('absoluteOrientationZ', absOrientZ);

    // Handle compass heading
    if (event.webkitCompassHeading !== undefined) {
      this._setProperty('heading', event.webkitCompassHeading);
    } else if (event.alpha !== null) {
      // Convert alpha to compass heading (alpha is measured clockwise, heading counter-clockwise)
      let heading = (360 - event.alpha) % 360;
      this._setProperty('heading', heading);
    }
  }
};

/**
 * Updates motion data from device sensors.
 * @method updateMotion
 * @param {Event} event - The motion event containing sensor data.
 * @private
 */
p5.prototype.updateMotion = function(event) {
  // Handle DeviceMotionEvent
  if (event instanceof DeviceMotionEvent) {
    const accWithGravity = event.accelerationIncludingGravity;
    const acc = event.acceleration;
    const rot = event.rotationRate;

    // Handle acceleration including gravity
    if (accWithGravity) {
      // Adjust for landscape mode if needed
      let gravityX = accWithGravity.x;
      let gravityY = accWithGravity.y;
      
      // Adjust values based on screen orientation
      if (deviceOrientation === 'landscape') {
        gravityX = -accWithGravity.y;
        gravityY = accWithGravity.x;
      } else if (deviceOrientation === 'portrait') {
        gravityX = accWithGravity.y;
        gravityY = -accWithGravity.x;
      }

      this._accelerationWithGravity = {
        x: gravityX,
        y: gravityY, 
        z: accWithGravity.z
      };
      this._setProperty('gravityX', gravityX);
      this._setProperty('gravityY', gravityY);
      this._setProperty('gravityZ', accWithGravity.z);
    }

    // Handle pure acceleration
    if (acc) {
      let accelX = acc.x;
      let accelY = acc.y;
      
      // Adjust values based on screen orientation
      if (deviceOrientation === 'landscape') {
        accelX = -acc.y;
        accelY = acc.x;
      } else if (deviceOrientation === 'portrait') {
        accelX = acc.y;
        accelY = -acc.x;
      }

      this._acceleration = {
        x: accelX,
        y: accelY,
        z: acc.z
      };
    }

    // Handle rotation rate
    if (rot) {
      let rotX = rot.beta;   // rotation around x-axis
      let rotY = rot.gamma;  // rotation around y-axis
      let rotZ = rot.alpha;  // rotation around z-axis
      
      // Adjust values based on screen orientation
      if (deviceOrientation === 'landscape') {
        rotX = rot.gamma;
        rotY = -rot.beta;
      } else if (deviceOrientation === 'portrait') {
        rotX = -rot.gamma;
        rotY = rot.beta;
      }

      this._rotation = {
        x: rotX,
        y: rotY,
        z: rotZ,
        alpha: rotZ,
        beta: rotX,
        gamma: rotY
      };
    }
  }
};

/**
 * Returns a JSON string containing debug information about motion sensor data.
 * @method debugMotion
 * @return {string} JSON string with motion sensor data
 */
p5.prototype.debugMotion = function() {
  return JSON.stringify({
    accelerationWithGravity: this._accelerationWithGravity,
    acceleration: this._acceleration, 
    rotation: this._rotation,
    orientation: this._orientation,
    absoluteOrientation: this._absoluteOrientation,
    screenOrientation: deviceOrientation
  });
};

/**
 * Retrieves the current acceleration data including gravity.
 * @method getAccelerationWithGravity
 * @return {Object|null} An object containing acceleration data or null if unavailable.
 * @alias getGravity
 */
p5.prototype.getAccelerationWithGravity = function() {
  if (this._sensorPermissionGranted && this._accelerationWithGravity) {
    return { ...this._accelerationWithGravity };
  } else {
    console.log("Accelerometer data not available.");
    return null;
  }
};


p5.prototype.getGravity = p5.prototype.getAccelerationWithGravity;

/**
 * Retrieves the current acceleration data.
 * @method getAcceleration
 * @return {Object|null} An object containing acceleration data or null if unavailable.
 */
p5.prototype.getAcceleration = function() {
  if (this._sensorPermissionGranted && this._acceleration) {
    return { ...this._acceleration };
  } else {
    console.log("Accelerometer data not available.");
    return null;
  }
};

/**
 * Retrieves the current rotation data.
 * @method getRotation
 * @return {Object|null} An object containing rotation data or null if unavailable.
 */
p5.prototype.getRotation = function() {
  if (this._sensorPermissionGranted && this._rotation) {
    return { ...this._rotation };
  } else {
    console.log("Rotation data not available.");
    return null;
  }
};

/**
 * Retrieves the current orientation data.
 * @method getOrientation
 * @return {Object|null} An object containing orientation data or null if unavailable.
 */
p5.prototype.getOrientation = function() {
  if (this._sensorPermissionGranted && this._orientation) {
    return { ...this._orientation };
  } else {
    console.log("Orientation data not available.");
    return null;
  }
};

/**
 * Retrieves the current absolute orientation data.
 * @method getAbsoluteOrientation
 * @return {Object|null} An object containing absolute orientation data or null if unavailable.
 */
p5.prototype.getAbsoluteOrientation = function() {
  if (this._sensorPermissionGranted && this._absoluteOrientation) {
    return { ...this._absoluteOrientation };
  } else {
    console.log("Absolute orientation data not available.");
    return null;
  }
};  

/*
Geolocation API
*/

/**
 * Requests the current geolocation of the device.
 * @method requestGeolocation
 */
p5.prototype.requestGeolocation = function(handleGeolocation, interval = 0) {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by this browser.");
        return;
    }

    const options = {
        enableHighAccuracy: true
    };

    const successCallback = (position) => {
        const geolocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        };
        this._setProperty('latitude', position.coords.latitude);
        this._setProperty('longitude', position.coords.longitude);
        handleGeolocation(geolocationData);
    };

    if (interval > 0) {
        // Set up recurring geolocation updates
        const watchId = navigator.geolocation.watchPosition(
            successCallback,
            this.showGeolocationError.bind(this),
            options
        );
        // Store watch ID to allow clearing later
        this._geolocationWatchId = watchId;

        // Set timeout to clear watch after interval
        setTimeout(() => {
            navigator.geolocation.clearWatch(watchId);
        }, interval);
    } else {
        // One-time geolocation request
        navigator.geolocation.getCurrentPosition(
            successCallback,
            this.showGeolocationError.bind(this),
            options
        );
    }
};

// /**
//  * Callback function to handle successful geolocation retrieval.
//  * @method getGeolocation
//  * @param {Position} position - The position object containing latitude and longitude.
//  * @return {Object} An object containing latitude and longitude.
//  */
// p5.prototype.getGeolocation = function(position) {
//     this._setProperty('latitude', position.coords.latitude);
//     this._setProperty('longitude', position.coords.longitude);
//     return {
//         latitude: position.coords.latitude,
//         longitude: position.coords.longitude
//     };
// };

/**
 * Callback function to handle geolocation errors.
 * @method showGeolocationError
 * @param {PositionError} error - The error object containing error code and message.
 */
p5.prototype.showGeolocationError = function(error) {
    let errorMsg = "";
    switch (error.code) {
        case error.PERMISSION_DENIED:
            errorMsg = "User denied the request for Geolocation.";
            break;
        case error.POSITION_UNAVAILABLE:
            errorMsg = "Location information is unavailable.";
            break;
        case error.TIMEOUT:
            errorMsg = "The request to get user location timed out.";
            break;
        case error.UNKNOWN_ERROR:
            errorMsg = "An unknown error occurred.";
            break;
    }
    console.error(errorMsg);
};

/*
Camera & Light Sensor
*/

/**
 * @property {p5.Element|null} _video
 * @private
 */
p5.prototype._video = null;

/**
 * @property {boolean} _isFrontCamera
 * @private
 */
p5.prototype._isFrontCamera = true;

/**
 * Returns whether the front camera is currently active.
 * @method isFrontCamera
 * @return {boolean} True if the front camera is active, false if the back camera is active.
 */
p5.prototype.isFrontCamera = function() {
  return this._isFrontCamera;
};

/**
 * @property {number} _brightnessLevel
 * @private
 */
p5.prototype._brightnessLevel = 0;

/**
 * Captures the color at the center of the video feed.
 * @method captureColor
 * @return {Array} An array containing RGB values.
 * @alias getColor
 */
p5.prototype.captureColor = function() {
    this._video.loadPixels();
    let index = ((this._video.height / 2) * this._video.width + this._video.width / 2) * 4;
    let r = this._video.pixels[index];
    let g = this._video.pixels[index + 1];
    let b = this._video.pixels[index + 2];

    let pickedColor = [r, g, b];

    return pickedColor;
};

/**
 * Captures the light level from the video feed.
 * @method captureLightLevel
 * @return {number} The brightness level.
 * @alias getLightLevel
 */
p5.prototype.captureLightLevel = function() {
    return this.updateBrightness();
};

/**
 * Captures the brightness level from the video feed.
 * @method captureBrightness
 * @return {number} The brightness level.
 * @alias getBrightness
 */
p5.prototype.captureBrightness = function() {
  return this.updateBrightness();
};

/**
 * Updates the brightness level from the video feed.
 * @method updateBrightness
 * @return {number} The updated brightness level.
 * @alias updateBrightness
 */
p5.prototype.updateBrightness = function() {
    this._video.loadPixels();
    let index = ((this._video.height / 2) * this._video.width + this._video.width / 2) * 4;
    let r = this._video.pixels[index];
    let g = this._video.pixels[index + 1];
    let b = this._video.pixels[index + 2];
    this._setProperty('_brightnessLevel', (r + g + b) / 3); // Compute grayscale brightness

    return this._brightnessLevel;
};

/**
 * Sets up the camera with the specified orientation.
 * @method setupCamera
 * @param {string} [selectCamera="front"] - The camera orientation, either "front" or "back".
 */
p5.prototype.setupCamera = function(selectCamera = "front") {
    if (this._video) {
        this._video.remove();
    }

    this._setProperty('_isFrontCamera', selectCamera === "front");

    let constraints = this._isFrontCamera
        ? { video: { facingMode: "user" }, audio: false }
        : { video: { facingMode: "environment" }, audio: false };

    this._video = createCapture(constraints);
    this._video.size(160, 120);
    this._video.loadPixels();

    this._video.hide();

    this._setProperty('_video', this._video);
    
};

/**
 * Sets up the light sensor using the camera.
 * @method setupLightSensor
 * @param {string} [selectCamera="front"] - The camera orientation, either "front" or "back".
 */
p5.prototype.setupLightSensor = function(selectCamera = "front") {
    this.setupCamera(selectCamera);
};

/**
 * Sets up the color sensor using the camera.
 * @method setupColorSensor
 * @param {string} [selectCamera="front"] - The camera orientation, either "front" or "back".
 */
p5.prototype.setupColorSensor = function(selectCamera = "front") {
    this.setupCamera(selectCamera);
};

/**
 * Initializes the camera with the specified orientation.
 * @method initializeCamera
 * @param {string} [selectCamera="front"] - The camera orientation, either "front" or "back".
 */
p5.prototype.initializeCamera = function(selectCamera = "front") {
    this.setupCamera(selectCamera);
};

/**
 * Toggles the camera between front and back.
 * @method toggleCamera
 */
p5.prototype.toggleCamera = function() {
    this._setProperty('_isFrontCamera', !this._isFrontCamera);
    this.initializeCamera(this._isFrontCamera ? "front" : "back");
};

/*
Sound Sensor
*/

/**
 * @property {p5.AudioIn|null} _mic
 * @private
 */
p5.prototype._mic = null;
p5.prototype._micStarted = false;

/**
 * Sets up the sound sensor.
 * @method setupSoundSensor
 */
p5.prototype.setupSoundSensor = function() {
    const startMic = () => {
        this.userStartAudio().then(() => {
            this._mic = new p5.AudioIn();
            this._mic.start();
            this._micStarted = true;
        }).catch((err) => {
            console.warn("Sound sensor could not start:", err);
        });
    };

    // Try immediately (works on desktop)
    if (getAudioContext().state === 'running') {
        startMic();
    } else {
        // On mobile, defer until first user gesture
        const onUserGesture = () => {
            startMic();
            document.removeEventListener('touchstart', onUserGesture);
            document.removeEventListener('mousedown', onUserGesture);
        };
        document.addEventListener('touchstart', onUserGesture, { once: true });
        document.addEventListener('mousedown', onUserGesture, { once: true });
    }
};

/**
 * Checks if the sound sensor is started.
 * @method isSoundSensorStarted
 * @return {boolean} True if the sound sensor is started, false otherwise.
 */
p5.prototype.isSoundSensorStarted = function() {
    return this._micStarted;
};

/**
 * Captures the current sound level.
 * @method captureSoundLevel
 * @return {number} The current sound level, or 0 if the mic is not yet started.
 */
p5.prototype.captureSoundLevel = function() {
    if (!this._micStarted || !this._mic) return 0;
    return this._mic.getLevel();
};

/**
 * Gets the current sound level from the microphone.
 * @method getSoundLevel
 * @return {number} The current sound level.
 */
p5.prototype.getSoundLevel = p5.prototype.captureSoundLevel;


/**
 * Gets the current color from the video feed.
 * @method getColor
 * @return {Array} An array containing RGB values.
 */
p5.prototype.getColor = p5.prototype.captureColor;

/**
 * Gets the current light level from the video feed.
 * @method getLightLevel
 * @return {number} The brightness level.
 */
p5.prototype.getLightLevel = p5.prototype.captureLightLevel;

/**
 * Gets the current brightness level from the video feed.
 * @method getBrightness
 * @return {number} The brightness level.
 */
p5.prototype.getBrightness = p5.prototype.captureBrightness;

/**
 * Enables swipe gestures by adding event listeners for touch events.
 * Calls the specified callback function for swipe gestures.
 * @method enableSwipe
 * @param {Function} onSwipe - Callback function for swipe gesture.
 */
p5.prototype.enableSwipe = function(onSwipe) {
  let initialTouch = null;

  const handleTouchStart = (event) => {
    if (event.touches.length === 1) {
      initialTouch = event.touches[0];
    }
  };

  const handleTouchMove = (event) => {
    if (event.touches.length === 1 && initialTouch) {
      const currentTouch = event.touches[0];
      const deltaX = currentTouch.pageX - initialTouch.pageX;
      const deltaY = currentTouch.pageY - initialTouch.pageY;

      let swipeDir = '';
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        swipeDir = deltaX > 0 ? 'right' : 'left';
      } else {
        swipeDir = deltaY > 0 ? 'down' : 'up';
      }

      onSwipe(swipeDir, deltaX, deltaY);
    }
  };

  const handleTouchEnd = () => {
    initialTouch = null;
  };

  document.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd, { passive: false });
};

/**
 * Enables pinch gestures by adding event listeners for touch events.
 * Calls the specified callback function for pinch gestures.
 * @method enablePinch
 * @param {Function} onPinch - Callback function for pinch gesture.
 */
p5.prototype.enablePinch = function(onPinch) {
  let initialDistance = null;
  let initialScale = 1;

  const handleTouchStart = (event) => {
    if (event.touches.length === 2) {
      initialDistance = Math.hypot(
        event.touches[0].pageX - event.touches[1].pageX,
        event.touches[0].pageY - event.touches[1].pageY
      );
      initialScale = 1; // Reset the initial scale
    }
  };

  const handleTouchMove = (event) => {
    if (event.touches.length === 2 && initialDistance !== null) {
      const currentDistance = Math.hypot(
        event.touches[0].pageX - event.touches[1].pageX,
        event.touches[0].pageY - event.touches[1].pageY
      );
      const scale = (currentDistance / initialDistance) * initialScale;
      onPinch(scale);
    }
  };

  const handleTouchEnd = () => {
    initialDistance = null;
  };

  document.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd, { passive: false });
};

