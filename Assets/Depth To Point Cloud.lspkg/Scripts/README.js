/*

About
==================

<Depth to Point Cloud VFX Asset>

a VFX that uses the depth data from a depth texture to generate a real-time point cloud. 

keywords:
depth texture, point cloud, particle system, vfx


Troubleshooting:
==================

1. LINKING TEXTURES

You need two textures for the graph to generate the point cloud:

1. a color texture for color sampling. 
In this case, we can use the default Device Camera Texture as the color texture.
2. a depth texture for depth sampling. 

You can click on PointCloudVFX asset inside DEPTH_TO_POINT_CLOUD_RESOUCES to check if both texture parameters are linked.


2. PREVIEW

Only INTERACTIVE ENVIRONMENT preview content provides the depth texture needed to render the point cloud.
To see the result in Lens Studio's preview tool, you need to switch preview type to INTERACTIVE ENVIRONMENT on the top-left corner of the Preview window.


3. PARTICLE SYSTEM IRREGULARITIES

If your point cloud doesnt change while navigation, or other strange particle formation. Please try those steps:

- change preview material and then change it back to Interactive Environment -> Colorful Home.
- make sure the camera came with the Asset is the only active in your scene. And it has a Device Tracking (World) component attached to it.

*/