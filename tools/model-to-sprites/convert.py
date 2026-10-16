"""Offline 3D model -> camera-angle transparent PNGs. Requires Blender 4.x.

Usage:
 blender --background --python tools/model-to-sprites/convert.py -- \
   --model knight.glb --output ./sprites/knight --frames 24 --size 512

No 3D model or runtime 3D dependencies are needed inside Sennet.
"""
import argparse
import math
import json
import sys
from pathlib import Path
import bpy
from mathutils import Vector

argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
parser=argparse.ArgumentParser()
parser.add_argument('--model', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--frames', type=int, choices=[12,24,36,48], default=24)
parser.add_argument('--size', type=int, default=512)
parser.add_argument('--elevation', type=float, default=25)
options=parser.parse_args(argv)
source=Path(options.model).resolve()
output=Path(options.output).resolve();output.mkdir(parents=True,exist_ok=True)
if not source.is_file(): raise FileNotFoundError(source)
if source.suffix.lower() not in ('.glb','.gltf','.obj','.fbx'): raise ValueError('Allowed: GLB, glTF, OBJ, FBX')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
if source.suffix.lower() in ('.glb','.gltf'):bpy.ops.import_scene.gltf(filepath=str(source))
elif source.suffix.lower()=='.obj':bpy.ops.wm.obj_import(filepath=str(source))
else:bpy.ops.import_scene.fbx(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes:raise ValueError('No renderable mesh in this file')
coords=[o.matrix_world @ Vector(v) for obj in meshes for v in obj.bound_box]
minima=Vector(tuple(min(v[i] for v in coords) for i in range(3)))
maxima=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
center=(minima+maxima)/2
longest=max((maxima-minima)) or 1
bpy.ops.object.camera_add();cam=bpy.context.object
bpy.context.scene.camera=cam
cam.data.type='ORTHO';cam.data.ortho_scale=longest*1.6
world=bpy.context.scene.world
if world:
  world.use_nodes=True
  bg=world.node_tree.nodes.get('Background')
  if bg:bg.inputs['Color'].default_value=(0.6,0.7,0.7,1);bg.inputs['Strength'].default_value=.8
for azimuth in (20,160,285):
  bpy.ops.object.light_add(type='AREA',location=(center.x+longest*math.cos(math.radians(azimuth))*2,center.y+longest*math.sin(math.radians(azimuth))*2,center.z+longest*2))
  light=bpy.context.object;light.data.energy=600;light.data.shape='DISK';light.data.size=longest*3
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=16
scene.render.resolution_x=options.size
scene.render.resolution_y=options.size
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
files=[]
for index in range(options.frames):
  angle=2*math.pi*index/options.frames
  elev=math.radians(options.elevation)
  dist=longest*3
  cam.location=center+Vector((dist*math.cos(angle)*math.cos(elev),dist*math.sin(angle)*math.cos(elev),dist*math.sin(elev)))
  direction=center-cam.location
  cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
  name=f'frame-{index:02d}.png';scene.render.filepath=str(output/name)
  bpy.ops.render.render(write_still=True);files.append(name)
(output/'manifest.template.json').write_text(json.dumps({'name':source.stem,'frames':files,'recommended':'Host these frames on your own HTTPS storage, then paste their public URLs into Sennet Workshop.'},indent=2))
print(f'Rendered {len(files)} frames to {output}')
