// TrailMeshBuilderController.js
// Version: 0.0.1
// Event: Initialized
// Description: creates a trail effect by defining two points.
// Pack: Refinement Pack


//@input Component.RenderMeshVisual renderMeshVisual
//@input Asset.Material material

//@ui {"widget":"separator"}
// @input SceneObject parentOfPOIs

//@ui {"widget":"separator"}
// @input int faceCount = 10 {"widget":"slider", "min":3, "max":20, "step":1}
// @input int radius = 1

//@ui {"widget":"separator"}
// @input bool rebuildOnUpdate

// Vars
var notMissingInputs;
var renderMeshVisual;
var builder;

function initialize() {
    notMissingInputs = validateInputs();
    
    if (notMissingInputs) {
        script.generate();

        if (script.rebuildOnUpdate) {
            script.createEvent("UpdateEvent").bind(script.generate);
        }
    }
}

// Define how our mesh data will look like
function setMeshBuilder() {
    renderMeshVisual = script.renderMeshVisual ? script.renderMeshVisual : script.getSceneObject().createComponent("Component.RenderMeshVisual");
    renderMeshVisual.clearMaterials();
    renderMeshVisual.mainMaterial = script.material;
    
    builder = new MeshBuilder([
        { name: "position", components: 3 },

        // We need this to define UV layout, and how textures will be laid out on the object
        { name: "texture0", components: 2 },

        // We need this to define the normal of each vertex in order for materials like PBR to work correctly.
        { name: "normal", components: 3, normalized: true },
    ]);
    builder.topology = MeshTopology.TriangleStrip;
    builder.indexType = MeshIndexType.UInt16;
}

// We expose this so we can keep calling it from outside the script
script.generate = function() {
    if (!notMissingInputs) {
        return;
    }
    
    if (!builder) {
        setMeshBuilder();
    }
    
    // Remove all previous mesh data
    var verticesfaceCount = builder.getVerticesCount();
    var indicesfaceCount = builder.getIndicesCount();
    if (verticesfaceCount > 0) {
        builder.eraseVertices(0, verticesfaceCount);
        builder.eraseIndices(0, indicesfaceCount);
    }

    // Create the mesh data generator
    var segmentedTube = new SegmentedTubeGenerator(builder, script.faceCount, script.radius);

    // Add a segment in between each Points of Interest
    for (var i = 0; i < script.parentOfPOIs.children.length-1; i++){
        var loc = script.parentOfPOIs.children[i].getTransform().getWorldPosition();
        var loc2 = script.parentOfPOIs.children[i+1].getTransform().getWorldPosition();
    
        segmentedTube.addSegment(loc, loc2, i != 0); 
    }

    // Build the Mesh
    if (builder.isValid()) {
        renderMeshVisual.mesh = builder.getMesh();
        builder.updateMesh();
    } else {
        print("Mesh data invalid!");
    }
};

// Calculate the vertices and indices of a mesh that connects two or more points with a tube.
function SegmentedTubeGenerator(builder, faceCount, radius) {
    
    // We can consider each connection between two points a segment
    // By seperating this function out, users can add more and more complicated paths.
    this.addSegment = function (startingPoint, endingPoint, joinWithPrev) {
        // For each segment, we need to know the direction vector between the from and two points
        // so that we can line up our tube between the two points
        var directionVec = startingPoint.sub(endingPoint).normalize();
        
        // Then, we can generate a cross section of our tube in the starting and ending point of our segments.
        var startCrossSection = getCircleAround(startingPoint, directionVec, radius, faceCount);
        var endCrossSection = getCircleAround(endingPoint, directionVec, radius, faceCount);

        // Finally, we take these two cross sections and connect them together to make the tube mesh.
        createMeshBetweenTwoCrossSections(startingPoint, startCrossSection, endCrossSection, joinWithPrev);
    }
    
    // In this example, the cross section (2D shape) of our tube is a n-gon circle.
    // We'll do this by figuring out a vector perpendicular to the direction of
    // our segment, then rotating it around on that axis, to determine all the vertices
    // of our cross section. (e.g. a hands on a clock).
    function getCircleAround(pos, dir, radius, faceCount){
        var anglePer = 2 * Math.PI / faceCount;
        var result = [];

        // First, we'll guess some vector that is generally perpendicular to
        // the direction of our segment. We compare two potential vectors, in case our guessed vector
        // is exactly the direction passed in (aka not perpendicular).
        var dotUp = dir.dot(vec3.up());
        var dotFwd = dir.dot(vec3.forward());
        var perpendicularVector = Math.abs(dotUp) < Math.abs(dotFwd) ? vec3.up() : vec3.forward();

        // Based on the guess vector, we can find another vector that is perpendicular
        // both the guessed and direction vector.
        var vecAround = dir.cross(perpendicularVector)
            .uniformScale(radius); // We'll also scale this vector based on the radius of the tube we want.
        
        // Now, all we have to do is rotate this perpedicular vector,
        // stopping at every increment of angle. 
        for (var i = 0; i < faceCount; i++) {
            var rotationQuat = quat.angleAxis(i * anglePer, dir);            
            var finalVector = rotationQuat.multiplyVec3(vecAround);

            // Lastly we will move the vector so that it starts at
            // the given position
            finalVector = finalVector.add(pos);
            
            result.push(new vec3(finalVector.x, finalVector.y, finalVector.z));
        }   
        
        return result;
    }
    
    function addVerticesOfCrossSections(startCenter, startCrossSection, endCrossSection) {
        // Since we want to wrap a texture around our mesh, we can say, that every
        // slice of our crosssection is a percent of the UV
        var crossSectionLengthPerVertex = 1/startCrossSection.length;

        // Next, we add to our mesh the vertices of our cross section,
        // alternating between the starting and ending cross section.
        // We use this order so our indices can easily increment by one.
        for(var i = 0; i < faceCount; i++){

            // === GENERATING COORDS OF EACH VERTICES
            var vertexPos = vecToArr(startCrossSection[i]);
            var vertexPos2 = vecToArr(endCrossSection[i]);

            // === GENERATING UV COORDS
            // U COORDS
            // The starting cross section will have the left side of the texture
            // and the ending cross section will ahve the right side of our texture
            // since our materials will interpolate between the two values.
            // V COORDS
            // Our V Coords is just some percentage of the overall texture height.
            var vertexUV = [0, i*crossSectionLengthPerVertex];
            var vertexUV2 = [1, i*crossSectionLengthPerVertex];

            // === GENERATING THE NORMALS
            // Since we're creating a tube with no end-cap, we can simply get the vector
            // radiating front the center of each cross section.
            // Note: A more complete solution would average all the normals 
            // of every face attached to this vertex, however.
            var vertexNormal = vecToArr(startCrossSection[i].sub(startCenter).normalize());

            // Finally, we add each vertices' info to the mesh.
            // Note that the order of these info matches with the ones defined in 
            // the `SetMeshBuilder` function
            builder.appendVertices([vertexPos, vertexUV, vertexNormal]);
            builder.appendVertices([vertexPos2, vertexUV2, vertexNormal]);
        }
    }

    // We may want to provide faces that fills the gap between the last and current segment
    // since the segments may be pointing in a different direction and does are not exactly the same.
    function addFaceBetweenPreviousAndCurrent(startingIndex) {
        var numberOfVerticesInASegment = 2 * faceCount - 1;

        // The first vertex in the last segment's ending cross section
        var indexOfLastSegmentEndCrossSection = startingIndex - numberOfVerticesInASegment; 

        // The first vertex in the new segment's starting cross section
        var indexOfCurrentSegmentStartCrossSection =  startingIndex;

        // We loop through the entire cross section.
        // We increment by two, because again, we are zig-zagging between the start
        // and end cross section of each segment.
        for (var i = 0; i < faceCount*2; i = i+2) {
            var indicesOfVerticesFormingAFace = [
                indexOfLastSegmentEndCrossSection + i, 
                indexOfCurrentSegmentStartCrossSection + i
            ];

            // We append the indices of our vertices as to build 
            // the mesh between the two cross sections.
            builder.appendIndices(indicesOfVerticesFormingAFace);
        }

        // Finally, we loop back to the starting index to close the pipe.
        builder.appendIndices([
            indexOfLastSegmentEndCrossSection, 
            indexOfCurrentSegmentStartCrossSection
        ])
    }

    // Since we laid out our vertices alternating between starting and ending
    // cross section, we can create a face by adding vertices index in order.
    function addFaceBetweenSegmentCrossSections(startingIndex) {
        var facesOfNewSegment = []
        var currentIndex = startingIndex;

        for(var i = 0; i < faceCount * 2; i++){
            facesOfNewSegment.push(currentIndex);
            currentIndex++;
        }
        builder.appendIndices( facesOfNewSegment );

        // Finally, we loop back to the starting index to close the pipe.
        builder.appendIndices( [startingIndex, startingIndex + 1] );
    }

    // Assuming the same number of vertices in a given cross section
    // We can zig-zag between vertices of the two cross sections to create a mesh.
    function createMeshBetweenTwoCrossSections(startCenter, startCrossSection, endCrossSection, joinWithPrev) {
        // Since this segment might not be the first one in the mesh, we need to keep track
        // of which vertex we are starting this segment on.
        var startingIndex = builder.getVerticesCount();
        
        addVerticesOfCrossSections(startCenter, startCrossSection, endCrossSection);

        // If we have more than one segments, we might want to connect 
        // the end of the last segment, with the starting of the new segment.
        if (joinWithPrev) {
            addFaceBetweenPreviousAndCurrent(startingIndex);
        }

        addFaceBetweenSegmentCrossSections(startingIndex);
    }

}

function validateInputs() {
    if (!script.material) {
        print("PipeBetweenObjects, ERROR: Please make sure to set a material for the trail effect.");
        return false;
    }
    
    if (!script.parentOfPOIs) {
        print("PipeBetweenObjects, ERROR: Please assign Parent of POIs which will be used to find child objects to show pipes in between.");
        return false;
    }

    return true;
}

// HELPERS
function vecToArr (v) {
    return [v.x, v.y, v.z];
}

initialize();

script.generate = script.generate;
