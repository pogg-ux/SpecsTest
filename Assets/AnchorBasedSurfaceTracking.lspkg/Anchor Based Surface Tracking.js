// AnchorBasedSurfaceTracking.js
// Version: 1.0.0
// Event: On Awake
// Description: This script positions a target object at a fixed distance in front of the camera along the xz-plane,
// Using a child object of a camera as a reference object and its position to determine the direction. The target object's y-coordinate is fixed at 0.
// If the reference object's height exceeds a specified threshold, the script will not update the target object's position.

//Instructions:
//Assign Camera: Drag and drop the camera object from your scene into the camera input field.
//Assign Reference Object:Add a child object to the surface Tracking camera and set its y-axis to 0.1. Drag and drop the reference object from your scene into the referenceObject input field. This object will be used to determine the direction for positioning the target object.
//Assign Target Object: Drag and drop the target object from your scene into the targetObject input field. This is the object that will be positioned at the specified distance in front of the camera.
//Set Distance: Set the desired distance (in units) from the camera to the target object in the distance input field.
//Height Adjustment: The script includes a height adjustment threshold. If the reference object's height exceeds this threshold, the target object's position will not be updated. You can adjust this threshold by modifying the heightAdjustment variable in the script.

//@input SceneObject camera
//@input SceneObject referenceObject 
//@input SceneObject targetObject
//@input float distance

var heightAdjustment = 0.097;

var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(function (eventData) {
    // Get the world position of the camera
    var cameraPosition = script.camera.getTransform().getWorldPosition();
    
    // Get the world position of the reference object
    var referenceObjectPosition = script.referenceObject.getTransform().getWorldPosition();
    
    // Calculate the vector from the camera to the reference object
    var forwardVector = referenceObjectPosition.sub(cameraPosition);
    
    if (forwardVector.y > heightAdjustment) {
        return;
    }
    
    // Set the y-component of the vector to 0 to keep movement in the xz-plane
    forwardVector.y = 0;
    
    // Normalize the vector to maintain direction but remove scaling
    forwardVector = forwardVector.normalize();
    
    // Scale the vector uniformly to the specified distance
    forwardVector = forwardVector.uniformScale(script.distance);
    
    // Calculate the new position in front of the camera at the specified distance
    var objectPosition = cameraPosition.add(forwardVector);
    
    // Set the target object's position with its y-coordinate fixed at 0
    script.targetObject.getTransform().setWorldPosition(new vec3(objectPosition.x, 0, objectPosition.z));
});
