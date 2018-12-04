/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licnses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
// import dat from 'dat.gui';
// import Stats from 'stats.js';
// import * as posenet from '../src';

// import { drawKeypoints, drawSkeleton } from './demo_util';
const maxVideoSize = document.getElementById('output').width;
const canvasSize = document.getElementById('output').width;
const stats = new Stats();

// ----------------------------- IMAGE VARIABLES ------------------------------------------------------
var hat = new Image();
var mask =  new Image();
var tee = new Image();
var leftBiceps = new Image();
var rightBiceps = new Image();
var rightPant = new Image();
var leftPant = new Image();
var sound = new Image();
var tree = new Image();
var rain = new Image();
var rain_src = new Image();
var face_mask = new Image();
const minScore = 0.50;
var costumeParams = undefined;

//-------------------------------- COSTUME 2 Parameters  -----------------------------------------------
var costume_2 = {
  "hat_x_factor" : 1,
  "hat_y_factor" : 1,
  "factor_adj" : 0.75

};

var costume_3 = {
  "hat_y_factor" : 0.5,
  "hat_x_factor" : 2
}

var timeMap = new Map();

//-------------------------------- COSTUME 3 Parameters  -----------------------------------------------

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function isiOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isMobile() {
  return isAndroid() || isiOS();
}

/**
 * Loads a the camera to be used in the demo
 *
 */
async function setupCamera() {
  const video = document.getElementById('video');
  video.width = maxVideoSize;
  video.height = maxVideoSize;

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const mobile = isMobile();
    const stream = await navigator.mediaDevices.getUserMedia({
      'audio': false,
      'video': {
        facingMode: 'environment',
        width: mobile ? undefined : maxVideoSize,
        height: mobile ? undefined: maxVideoSize}
    });
    video.srcObject = stream;

    return new Promise(resolve => {
      video.onloadedmetadata = () => {
        resolve(video);
      };
    });
  } else {
    const errorMessage = "This browser does not support video capture, or this device does not have a camera";
    alert(errorMessage);
    return Promise.reject(errorMessage);
  }
}

async function loadVideo() {
  const video = await setupCamera();
  video.play();

  return video;
}

const guiState = {
  algorithm: 'single-pose',
  input: {
    mobileNetArchitecture: isMobile() ? '0.50' : '1.01',
    outputStride: 16,
    imageScaleFactor: 0.5,
  },
  singlePoseDetection: {
    minPoseConfidence: 0.1,
    minPartConfidence: 0.5,
  },
  multiPoseDetection: {
    maxPoseDetections: 2,
    minPoseConfidence: 0.1,
    minPartConfidence: 0.3,
    nmsRadius: 20.0,
  },
  output: {
    showVideo: true,
    showSkeleton: true,
    showPoints: true,
  },
  net: null,
};


function loadImages() {
  hat.src = "img/1/hat.png";
  mask.src = "img/1/mask.png";
  tee.src = "img/1/shirt-1.png";
  leftBiceps.src = "img/1/leftArm.png";
  rightBiceps.src = "img/1/rightArm.png"; 
  rightPant.src = "img/1/rightPant.png";
  leftPant.src = "img/1/leftPant.png";

}

/**
 * Sets up dat.gui controller on the top-right of the window
 */
function setupGui(cameras, net) {
  guiState.net = net;

  if (cameras.length > 0) {
    guiState.camera = cameras[0].deviceId;
  }

  const cameraOptions = cameras.reduce((result, { label, deviceId }) => {
    result[label] = deviceId;
    return result;
  }, {});

  const gui = new dat.GUI({ width: 300 });

  // The single-pose algorithm is faster and simpler but requires only one person to be
  // in the frame or results will be innaccurate. Multi-pose works for more than 1 person
  const algorithmController = gui.add(
    guiState, 'algorithm', ['single-pose', 'multi-pose']);

  // The input parameters have the most effect on accuracy and speed of the network
  let input = gui.addFolder('Input');
  // Architecture: there are a few PoseNet models varying in size and accuracy. 1.01
  // is the largest, but will be the slowest. 0.50 is the fastest, but least accurate.
  const architectureController =
    input.add(guiState.input, 'mobileNetArchitecture', ['1.01', '1.00', '0.75', '0.50']);
  // Output stride:  Internally, this parameter affects the height and width of the layers
  // in the neural network. The lower the value of the output stride the higher the accuracy
  // but slower the speed, the higher the value the faster the speed but lower the accuracy.
  input.add(guiState.input, 'outputStride', [8, 16, 32]);
  // Image scale factor: What to scale the image by before feeding it through the network.
  input.add(guiState.input, 'imageScaleFactor').min(0.2).max(1.0);
  input.open();

  // Pose confidence: the overall confidence in the estimation of a person's
  // pose (i.e. a person detected in a frame)
  // Min part confidence: the confidence that a particular estimated keypoint
  // position is accurate (i.e. the elbow's position)
  let single = gui.addFolder('Single Pose Detection');
  single.add(guiState.singlePoseDetection, 'minPoseConfidence', 0.0, 1.0);
  single.add(guiState.singlePoseDetection, 'minPartConfidence', 0.0, 1.0);
  single.open();

  let multi = gui.addFolder('Multi Pose Detection');
  multi.add(
    guiState.multiPoseDetection, 'maxPoseDetections').min(1).max(20).step(1);
  multi.add(guiState.multiPoseDetection, 'minPoseConfidence', 0.0, 1.0);
  multi.add(guiState.multiPoseDetection, 'minPartConfidence', 0.0, 1.0);
  // nms Radius: controls the minimum distance between poses that are returned
  // defaults to 20, which is probably fine for most use cases
  multi.add(guiState.multiPoseDetection, 'nmsRadius').min(0.0).max(40.0);

  let output = gui.addFolder('Output');
  output.add(guiState.output, 'showVideo');
  output.add(guiState.output, 'showSkeleton');
  output.add(guiState.output, 'showPoints');
  output.open();


  architectureController.onChange(function (architecture) {
    guiState.changeToArchitecture = architecture;
  });

  algorithmController.onChange(function (value) {
    switch (guiState.algorithm) {
      case 'single-pose':
        multi.close();
        single.open();
        break;
      case 'multi-pose':
        single.close();
        multi.open();
        break;
    }
  });
}

/**
 * Sets up a frames per second panel on the top-left of the window
 */
function setupFPS() {
  stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
  document.body.appendChild(stats.dom);
}

/**
 * Feeds an image to posenet to estimate poses - this is where the magic happens.
 * This function loops with a requestAnimationFrame method.
 */
function detectPoseInRealTime(video, net) {
  const canvas = document.getElementById('output');
  const ctx = canvas.getContext('2d');
  const flipHorizontal = true; // since images are being fed from a webcam

  var position = [];
  sound.src = "img/sound.png";
  rain.src ="img/rain.png";
  tree.src = "img/tree.png";
  rain_src.src = "img/rain.gif";


  canvas.width = canvasSize;
  canvas.height = canvasSize;

  async function poseDetectionFrame() {
    if (guiState.changeToArchitecture) {
      // Important to purge variables and free up GPU memory
      guiState.net.dispose();

      // Load the PoseNet model weights for either the 0.50, 0.75, 1.00, or 1.01 version
      guiState.net = await posenet.load(Number(guiState.changeToArchitecture));

      guiState.changeToArchitecture = null;
    }

    // Begin monitoring code for frames per second
    stats.begin();

    // Scale an image down to a certain factor. Too large of an image will slow down
    // the GPU
    const imageScaleFactor = guiState.input.imageScaleFactor;
    const outputStride = Number(guiState.input.outputStride);

    let poses = [];
    let minPoseConfidence;
    let minPartConfidence;
    switch (guiState.algorithm) {
      case 'single-pose':
        const pose = await guiState.net.estimateSinglePose(video, imageScaleFactor, flipHorizontal, outputStride);
        poses.push(pose);
        // console.log(pose);

        var values = pose['keypoints'];

        for(var i=0;i<values.length;i++)
        {
          position[values[i]['part']] = values[i]['position'];
          position[values[i]['part']]['score'] = values[i]['score'];
        }

        var leftEye =  position['leftEye'];
        var rightEye = position['rightEye'];
        
        var nose = position['nose'];
        
        var leftEar = position['leftEar'];
        var rightEar = position['rightEar'];
        
        var leftShoulder = position['leftShoulder'];
        var rightShoulder = position['rightShoulder'];

        var rightHip = position['rightHip'];
        var leftHip = position['leftHip'];

        var leftElbow = position['leftElbow'];
        var rightElbow = position['rightElbow'];    

        var leftKnee = position["leftKnee"];
        var rightKnee = position["rightKnee"]; 

        var rightwrist_x = position['rightWrist']['x'];
        var rightwrist_y = position['rightWrist']['y'];

        var leftwrist_x = position['leftWrist']['x'];
        var leftwrist_y = position['leftWrist']['y'];   


        var rightWrist = position["rightWrist"];
        var leftWrist = position["leftWrist"];

        minPoseConfidence = Number(
          guiState.singlePoseDetection.minPoseConfidence);
        minPartConfidence = Number(
          guiState.singlePoseDetection.minPartConfidence);
        break;      
    }

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    if (guiState.output.showVideo) 
    {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvasSize, 0);
      ctx.drawImage(video, 0, 0, canvasSize, canvasSize);
      ctx.restore();
    }

    //draw canvas button images 

    ctx.drawImage(sound, 5, 150, 25, 25);
    ctx.drawImage(rain, 5, 180, 25, 25);
    ctx.drawImage(tree, 5, 210, 25, 25);


    // console.log(rightwrist_x+'---'+rightwrist_y);

    if( (rightwrist_x > 0 && rightwrist_x < 27) && (rightwrist_y > 149 && rightwrist_y < 170) )
    {
        jQuery("body").find('#myaudio').get(0).play();
    } 

    if( (rightwrist_x > 0 && rightwrist_x < 27) && (rightwrist_y > 175 && rightwrist_y < 210) )
    {
      jQuery(".rain-bg").removeClass('hide');
      jQuery(".tree-bg").addClass('hide');
    }

    if( (rightwrist_x > 0 && rightwrist_x < 27) && (rightwrist_y > 215 && rightwrist_y < 240) )
    {
      jQuery(".tree-bg").removeClass('hide');
      jQuery(".rain-bg").addClass('hide');
    }

    //draw canvas button images end


   /*
    ####################################    Common Variables    ####################################
    */
 
    const y = 'y';
    const x = 'x';
    const score = 'score';

    var isHeadNeeded = 0;
    

    var shoulder_y_mid = (leftShoulder['y'] + rightShoulder['y'])/2;
    var neck = {
      y: (nose[y] +  shoulder_y_mid )/ 2,
      x:(leftShoulder['x'] + rightShoulder['x']) /2 
    };    
    var armPivot  ={
      x : (leftShoulder[x] + rightShoulder[x] ) / 2,
      y : (leftShoulder[y] + rightShoulder[y] ) /2
    };

    var midHip = { 
      x : (rightHip[x] + leftHip[x])/2,
      y : (rightHip[y] + leftHip[y])/2
    }

     /*
    ####################################    Draw Right Arm    ####################################
    */
    
    var rightArm_slope = ( rightShoulder[y] - rightElbow[y] ) / ( rightShoulder[x] - rightElbow[x] );
    var rightArm_deg =  Math.atan(rightArm_slope) *180/Math.PI;
    var rightArm_degDelta = (rightArm_deg / -6) ; 

    if((rightArm_deg > 0)) 
        rightArm_degDelta = rightArm_deg/2;


    var rightArm_w_fac = 1.1;
    var rightArm_y_fac = 1;
    var rightArm_x_fac = 2;
    var rightArm_x_adj = neck[x] - rightShoulder[x]  ; 
    var rightArm_x = rightShoulder[x] + rightArm_x_adj / rightArm_x_fac ;

    var rightArmDist = Math.sqrt( Math.pow(rightShoulder[x] - rightElbow[x] , 2) + Math.pow(rightShoulder[y] - rightElbow[y], 2));
    var rightArm_y_adj = (rightShoulder[y] - neck[y])/ rightArm_y_fac;
    var rightArm_y = rightShoulder[y] - rightArm_y_adj;
    var rightArm_w =  armPivot[x] * rightArm_w_fac - rightShoulder[x] ;
    var rightArm_h =   rightArmDist + rightArm_y_adj * 1.5;

     if(rightHip[score] > minScore && leftHip[score] > minScore 
        && leftShoulder[score] > minScore && leftElbow[score] > minScore 
        && rightShoulder[score] > minScore && rightElbow[score] > minScore
        && nose[score] > minScore) {
        // console.log(" calculated angle " + rightArm_deg)
        ctx.save();    
        ctx.translate(rightShoulder[x], rightShoulder[y]);
        ctx.rotate(((rightArm_deg + 90) - rightArm_degDelta)*Math.PI/180);
        ctx.drawImage(rightBiceps, rightArm_x - rightShoulder[x] , rightArm_y - rightShoulder[y], -rightArm_w, rightArm_h);
        ctx.restore();
    }
    /*
    ####################################    Draw Left Arm    ####################################
    */
    
    var leftArm_slope = ( leftShoulder[y] - leftElbow[y] ) / ( leftShoulder[x] - leftElbow[x] );
    var leftArm_deg =  Math.atan(leftArm_slope) *180/Math.PI;
    var leftArm_degDelta = (leftArm_deg / 6) ; 

    if((leftArm_deg < 0)) 
        leftArm_degDelta = leftArm_deg/-2;

    var leftArm_w_fac = 0.9;
    var leftArm_y_fac = 1;
    var leftArm_x_fac = 2;
    var leftArm_x_adj = leftShoulder[x] - neck[x] ; 
    var leftArm_x = leftShoulder[x] - leftArm_x_adj / leftArm_x_fac ;

    var leftArmDist = Math.sqrt( Math.pow(leftShoulder[x] - leftElbow[x] , 2) + Math.pow(leftShoulder[y] - leftElbow[y], 2));
    var leftArm_y_adj = (leftShoulder[y] - neck[y]  )/ leftArm_y_fac;
    var leftArm_y = leftShoulder[y] -  leftArm_y_adj;
    var leftArm_w = leftShoulder[x]  - armPivot[x] * leftArm_w_fac;
    var leftArm_h =   leftArmDist + leftArm_y_adj * 1.5;

    // ctx.drawImage(leftBiceps, leftArm_x, leftArm_y, leftArm_w, leftArm_h);
    if(rightHip[score] > minScore && leftHip[score] > minScore 
        && leftShoulder[score] > minScore && leftElbow[score] > minScore 
        && rightShoulder[score] > minScore && rightElbow[score] > minScore
        && nose[score] > minScore) {

        // console.log(" calculated angle " + leftArm_deg)
        ctx.save();    
        ctx.translate(leftShoulder[x], leftShoulder[y]);
        ctx.rotate(((leftArm_deg - 90) + leftArm_degDelta)*Math.PI/180);
        ctx.drawImage(leftBiceps, leftArm_x - leftShoulder[x] , leftArm_y - leftShoulder[y], leftArm_w, leftArm_h);
        ctx.restore();
    }


    


   /*
    ####################################    Draw  Pant    ####################################
    */
    
    var rightPant_slope = (rightKnee[y] - rightHip[y]) / (rightKnee[x] - rightHip[x]) ;
    var rightPant_deg = -Math.abs( Math.atan(rightPant_slope)  *180/Math.PI);
    rightPant_deg =  rightPant_deg  - 10;
    var rightPant_dist = Math.sqrt( Math.pow(rightKnee[x] - rightHip[x] , 2) + Math.pow(rightKnee[y] - rightHip[y], 2));
    var rightPant_x_adj = ((midHip[x] - rightHip[x] ) + ( leftHip[x] - midHip[x] ) )/2;
    var rightPant_x = rightShoulder[x]  - rightPant_x_adj;
    rightPant_x = rightPant_x < rightShoulder[x] ? rightPant_x : rightShoulder[x]* 0.9;
    var rightPant_y =  midHip[y] *0.95;
    var rightPant_w = midHip[x] -  rightPant_x;
    var rightPant_h = rightPant_dist * 1.1;
    



    var leftPant_slope = (leftKnee[y] - leftHip[y]) / (leftKnee[x] - leftHip[x]) ;
    var leftPant_deg = Math.abs( Math.atan(leftPant_slope)  *180/Math.PI);
    leftPant_deg =  leftPant_deg  + 10;
    var leftPant_dist = Math.sqrt( Math.pow(leftKnee[x] - leftHip[x] , 2) + Math.pow(leftKnee[y] - leftHip[y], 2));
    // var rightPant_x_adj = ((midHip[x] - rightHip[x] ) + ( leftHip[x] - midHip[x] ) )/2;
    var leftPant_x =   midHip[x] ;
    // rightShoulder[x]  - rightPant_x_adj;
    leftPant_x = leftPant_x < armPivot[x] ? leftPant_x : armPivot[x];
    // * 0.9;
    var leftPant_y =  midHip[y] *0.95;
    var leftPant_w =  leftShoulder[x]  + rightPant_x_adj - leftPant_x;
    var leftPant_h = leftPant_dist * 1.1;
    
    

    
    
    
    // ---------------------------------------------------------------------------------------


    /*
    ####################################    Draw TEE    ####################################
    */
    var tee_x_adj = (neck[x] - rightShoulder[x] ) /3;
    var tee_x = rightShoulder[x]  - tee_x_adj;
    var tee_y_adj =  ( rightShoulder[y]  - nose[y] )  / 2
    var tee_w = leftShoulder[x] - rightShoulder[x] + tee_x_adj * 2;
    var tee_h = rightHip[y] - rightShoulder[y] + tee_y_adj ;
    var tee_y =  rightShoulder[y]  - tee_y_adj; 
  
   if(rightHip[score] > minScore && leftHip[score] > minScore 
        && leftShoulder[score] > minScore && leftElbow[score] > minScore 
        && rightShoulder[score] > minScore && rightElbow[score] > minScore
        && nose[score] > minScore) {
        ctx.drawImage(tee, tee_x, tee_y *1.05, tee_w, tee_h);
        isHeadNeeded++;
   }

    if(rightHip[score] > minScore && leftHip[score] > minScore && rightKnee[score] > minScore && leftKnee[score] > minScore 
        && rightShoulder[score] > minScore && leftShoulder[score] > minScore && nose[score] > minScore ) {

      ctx.save();
      ctx.translate(rightHip[x], rightHip[y]);
      ctx.rotate((rightPant_deg+90)*Math.PI/180);
      ctx.drawImage(rightPant, rightPant_x - rightHip[x], rightPant_y - rightHip[y], rightPant_w, rightPant_h);
      ctx.restore();


      ctx.save();
      ctx.translate(leftHip[x], leftHip[y]);
      ctx.rotate((leftPant_deg-90)*Math.PI/180);
      ctx.drawImage(leftPant, leftPant_x - leftHip[x], leftPant_y - leftHip[y], leftPant_w, leftPant_h);
      ctx.restore();
      isHeadNeeded++;

    }
    /*
    ####################################    Draw MASK    ####################################
    */
    
    var mask_x_factor = 0.75;
    var mask_y_factor = 0;
    var mask_x_adjustment = ( rightEye[x] - rightEar[x] ) * mask_x_factor;
    var mask_y_adjustment = ( nose[y] - (rightEye[y]  + leftEye[y])/2   ) * mask_y_factor;
    var mask_ratio =  mask.height / mask.width;
    var mask_x = rightEar[x] - mask_x_adjustment;
    var mask_w = leftEar[x] - mask_x + mask_x_adjustment;
    var mask_h = mask_w * mask_ratio;
    var mask_y = nose[y] -  ( mask_h + mask_y_adjustment) ;


    /*
    ####################################    Draw HAT    ####################################
    */

    var factor = hat.height/hat.width;
    var hat_x_factor = 2.5;
    var hat_y_factor = 0;
    var factor_adj = 1;

    var head_slope =(leftEye[y] - rightEye[y])/ (leftEye[x] - rightEye[x])  ;
    var head_deg = Math.atan(head_slope) *180/Math.PI;

    var hat_adj_x = ( (rightEye[x] - rightEar[x]) + (leftEar[x]  - leftEye[x]) ) /2;
    var hat_adj_x = ( (nose[x] - rightEye[x]) + (leftEye[x] - nose[x]) ) /2;
    if(costumeParams != undefined) {
      hat_x_factor = costumeParams["hat_x_factor"]  != undefined ?  costumeParams["hat_x_factor"]: hat_x_factor ;
      hat_y_factor = costumeParams["hat_y_factor"]  != undefined ?  costumeParams["hat_y_factor"]: hat_y_factor ;
      factor_adj = costumeParams["factor_adj"]  != undefined ?  costumeParams["factor_adj"]: factor_adj ;
    }


    var hat_x = rightEar[x] - hat_adj_x * hat_x_factor;
    var hat_w =   leftEar[x] -hat_x + hat_adj_x * hat_x_factor;
    var hat_h = hat_w * factor * factor_adj;
    var hat_y = rightEye[y]-(hat_y_factor* (nose[y] - rightEye[y]) + hat_h) ; 
    
    // ---------------------------------------------------------------------------------------


      if(isHeadNeeded != 2) {
              if( nose[score] > minScore 
                && leftEye[score] > minScore && leftEar[score] > minScore 
                && rightEye[score] > minScore && rightEye[score] > minScore ) {
                ctx.save();
                ctx.translate(neck[x], neck[y]);
                ctx.rotate(head_deg*Math.PI/180);
                ctx.drawImage(mask, mask_x - neck[x], mask_y  - neck[y], mask_w, mask_h);
                ctx.drawImage(hat, hat_x - neck[x], hat_y - neck[y], hat_w, hat_h);
                ctx.restore();
              } 
      }
/*
      else {
      //draw face mask. 
        var facemask_x =  rightEye[x] - hat_adj_x;
        var facemask_w = leftEar[x] -  rightEye[x] + hat_adj_x;
        var facemask_h =  ( neck[y] - (leftEar[y] + rightEar[y]) /2) * 2;
        var facemask_y = neck[y] - facemask_h;

        ctx.save();
        ctx.translate(neck[x], neck[y]);
        ctx.rotate(head_deg*Math.PI/180);
        // ctx.drawImage(mask, mask_x - neck[x], mask_y  - neck[y], mask_w, mask_h);
        ctx.drawImage(face_mask, facemask_x - neck[x], facemask_y - neck[y], facemask_w, facemask_h);
        ctx.restore();



    }
*/

    /*
##################################  GESTURES  ##########################################################

    */
      var d = new Date();
      var curTimeIn10Millis = Math.trunc(d.getTime() / 10);
      timeMap.set(curTimeIn10Millis, position);
      var oldPosition = timeMap.get(curTimeIn10Millis - 100  );

      var gestureTime = 100 *4 ; //  No. of seconds.  

      // Gesture 1 rightEar -- rightWrist
      var isGesture1 = false;
      var isGesture2 = false;
      var isGesture3 = false;
      var isGesture4 = false;
      var isGesture5 = false;
      var isGestureSet = false;
      if(oldPosition != undefined) {
            var old_rightEar = oldPosition["rightEar"];
            var old_leftEar = oldPosition["leftEar"];

            var old_rightWrist = oldPosition["rightWrist"];
            var old_leftWrist = oldPosition["leftWrist"];

            var old_rightElbow = oldPosition["rightElbow"];
            var old_leftElbow = oldPosition["leftElbow"];

            var old_rightShoulder = oldPosition["rightShoulder"];
            var old_leftShoulder = oldPosition["leftShoulder"];


            if(old_rightWrist[score] > minScore && old_rightEar[score] > minScore 
               &&  rightWrist[score] > minScore && rightEar[score] > minScore) {
              isGesture1 = old_rightEar[y] > old_rightWrist[y] && rightEar[y] > rightWrist[y];
              isGestureSet = isGesture1 == true;
            console.log("var isGesture1 Gesture 1 is : " + isGesture1);
            }


            if(old_rightWrist[score] > minScore && old_rightShoulder[score] > minScore 
               &&  rightWrist[score] > minScore && rightShoulder[score] > minScore  && !isGestureSet ) {

                    isGesture2 = old_rightWrist[y] < old_rightShoulder[y]
                                 && rightWrist[y] < rightShoulder[y];

                    isGesture2 = isGesture2 
                                && old_rightWrist[y] > old_rightEar[y]
                                 && rightWrist[y] > rightEar[y];

                    isGestureSet = isGesture2 == true;

                    console.log("var isGesture2 Gesture 2 is : " + isGesture2);
             }


             if(old_leftWrist[score] > minScore && old_leftEar[score] > minScore 
               &&  leftWrist[score] > minScore &&     leftEar[score] > minScore && !isGestureSet) {

                    isGesture4 = old_leftWrist[y] < old_leftEar[y]
                                 && leftWrist[y] < leftEar[y];
                    isGestureSet = isGesture4 == true;

                    console.log("var isGesture4 Gesture 4 is : " + isGesture4);
             }


            if(old_leftWrist[score] > minScore && old_leftShoulder[score] > minScore 
               &&  leftWrist[score] > minScore &&     leftShoulder[score] > minScore && !isGestureSet) {

                    isGesture3 = old_leftWrist[y] < old_leftShoulder[y]
                                 && leftWrist[y] < leftShoulder[y];
                    isGesture3 = isGesture3 && 
                                  old_leftWrist[y] > old_leftEar[y]
                                 && leftWrist[y] > leftEar[y];
                    isGestureSet = isGesture3 == true;
                    console.log("var isGesture3 Gesture 3 is : " + isGesture3);
             }


           

             if(old_leftElbow[score] > minScore && old_rightElbow[score] > minScore 
              && leftElbow[score] > minScore && rightElbow[score] > minScore 
              && old_leftWrist[score] > minScore && old_rightWrist[score] > minScore
              && leftWrist[score] > minScore && rightWrist[score] > minScore && !isGestureSet) {

                isGesture5 = old_leftWrist[y] < old_leftElbow[y] && old_rightWrist[y] < old_rightElbow[y] 
                            && leftWrist[y] < leftElbow[y] && rightWrist[y] < rightElbow[y]  ;

                isGesture5 = isGesture5 && 
                            old_leftWrist[x] < old_leftElbow[x] && old_rightWrist[x] > old_rightElbow[x] 
                            && leftWrist[x] < leftElbow[x] && rightWrist[x] > rightElbow[x]  ;

                isGesture5 = isGesture5 && 
                              old_leftWrist[y] > old_leftShoulder[y] && old_rightWrist[y] > old_rightShoulder[y] 
                            && leftWrist[y] > leftShoulder[y] && rightWrist[y] > rightShoulder[y]  ;   

                isGestureSet = isGesture5 == true;
                    console.log("var isGesture5 Gesture 5 is : " + isGesture5);

             }

       }

      // delete old Keys.
      timeMap.delete(curTimeIn10Millis - gestureTime);

      if(isGesture1)
      {
          if(jQuery(".girl-bg").hasClass('hide')) {
              jQuery(".video-div").removeClass("hide"); 
              jQuery("body").find('#myvideo').get(0).play();
        }
      }

      if(isGesture2)
      {

           if(jQuery(".video-div").hasClass('hide')) {
                jQuery(".girl-bg").removeClass('hide');
                jQuery(".girl-bg").stop();
                jQuery(".girl-bg").animate({left: '500px'} ,{duration:1000});
        }
      }

      if(isGesture4)
      {
             var theme = Math.floor(Math.random() * 3);
             theme+=1;

             var lastUpdated = timeMap.get("costume");
             if(lastUpdated != undefined ) {
                var d = new Date();
                var curT = Math.trunc (d.getTime()/10);
                if( curT - lastUpdated >  gestureTime *2 ) {
                           jQuery(".costume-"+theme).click();                  
                           timeMap.set("costume", curT);
                }

             } else {
                    jQuery(".costume-"+theme).click();                  
                    timeMap.set("costume", curT);

             }

      }

      if(isGesture3)
      {
            hat.src = '';
            mask.src = '';
            tee.src = '';
            leftBiceps.src = '';
            rightBiceps.src = ''; 
            rightPant.src = '';
            leftPant.src = '';
      }

      if(isGesture5)
      {
          jQuery(".tree-bg").addClass('hide');
          jQuery(".rain-bg").addClass('hide');
          jQuery("body").find('#myaudio').get(0).pause();
          jQuery(".video-div").addClass("hide"); 
          jQuery("body").find('#myvideo').get(0).pause();
          jQuery(".girl-bg").addClass('hide');
          jQuery(".girl-bg").stop();
          jQuery(".girl-bg").animate({left: '0px'} ,{duration:1000});
      }  


    /*
############################################################################################

    */


    const scale = canvasSize / video.width;

    // For each pose (i.e. person) detected in an image, loop through the poses
    // and draw the resulting skeleton and keypoints if over certain confidence
    // scores
    poses.forEach(({ score, keypoints }) => {
      if (score >= minPoseConfidence) {
        if (guiState.output.showPoints) {
          drawKeypoints(keypoints, minPartConfidence, ctx, scale);
        }
        if (guiState.output.showSkeleton) {
          drawSkeleton(keypoints, minPartConfidence, ctx, scale);
        }
      }
    });

    // End monitoring code for frames per second
    stats.end();

    requestAnimationFrame(poseDetectionFrame);
  }

  poseDetectionFrame();

}

/**
 * Kicks off the demo by loading the posenet model, finding and loading available
 * camera devices, and setting off the detectPoseInRealTime function.
 */
$(".costume").click(function(){

  var number = $(this).attr("data-id");
  hat.src = 'img/'+number+'/hat.png';
  tee.src = 'img/'+number +'/shirt-1.png';
  leftBiceps.src = 'img/' + number + '/leftArm.png';
  rightBiceps.src = 'img/' + number + '/rightArm.png'; 
  mask.src = 'img/' + number + '/mask.png'; 
  rightPant.src = 'img/' + number + '/rightPant.png'; 
  leftPant.src = 'img/' + number + '/leftPant.png'; 
  // face_mask.src = 'img/' + number + '/facemask.png'; 
  
  // console.log("success");
  if(number == 1 ) {
    costumeParams = undefined;
  }
  if(number == 2) {
    costumeParams = costume_2;
  } else if( number == 3) {
    costumeParams = costume_3;
  }



});

async function bindPage() {
  // Load the PoseNet model weights for version 1.01
  const net = await posenet.load();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('main').style.display = 'block';

  let video;

  try {
    video = await loadVideo();
  } catch(e) {
    console.error(e);
    return;
  }

  setupGui([], net);
  setupFPS();
  detectPoseInRealTime(video, net);
}

navigator.getUserMedia = navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia;
bindPage(); // kick off the demo