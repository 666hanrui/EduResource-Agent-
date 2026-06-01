import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';

// Expose PIXI to window so pixi-live2d-display can call it internally
(window as any).PIXI = PIXI;

interface Props {
  isSpeaking: boolean;
  width?: number;
  height?: number;
  scale?: number;
  xOffset?: number;
  yOffset?: number;
}

export function TutorLive2D({ 
  isSpeaking, 
  width = 140, 
  height = 180, 
  scale = 0.045, 
  xOffset = 15, 
  yOffset = -5 
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const speakingIntervalRef = useRef<any>(null);

  useEffect(() => {
    let active = true;

    async function init() {
      // Dynamic import to prevent SSR/window timing issues in Vite
      const { Live2DModel } = await import('pixi-live2d-display/cubism4');

      if (!canvasRef.current || !active) return;

      // Create PIXI Application
      const app = new PIXI.Application({
        view: canvasRef.current,
        autoStart: true,
        backgroundAlpha: 0,
        width: width,
        height: height,
        antialias: true,
      });
      appRef.current = app;

      try {
        // Haru Cubism 4 model hosted locally
        const modelUrl = "/live2d/haru/haru_greeter_t03.model3.json";
        const model = await Live2DModel.from(modelUrl, {
          autoInteract: true, // Automatically tracks cursor and responds to clicks
        });

        if (!active) {
          app.destroy(false);
          return;
        }

        modelRef.current = model;

        // Position and Scale the model inside the custom view
        model.scale.set(scale);
        model.x = xOffset;
        model.y = yOffset;

        // Add model to stage
        app.stage.addChild(model);
      } catch (err) {
        console.error("Failed to load Live2D model:", err);
      }
    }

    init();

    return () => {
      active = false;
      if (appRef.current) {
        appRef.current.destroy(false);
        appRef.current = null;
      }
      modelRef.current = null;
    };
  }, [width, height, scale, xOffset, yOffset]);

  // Sync mouth movement when tutor is speaking
  useEffect(() => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }

    const model = modelRef.current;
    if (!model) return;

    if (isSpeaking) {
      // Animate mouth opening and closing
      speakingIntervalRef.current = setInterval(() => {
        const mouthOpen = Math.random() * 0.75;
        if (model.internalModel?.coreModel) {
          model.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", mouthOpen);
        }
      }, 100);
    } else {
      // Close mouth when finished speaking
      if (model.internalModel?.coreModel) {
        model.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", 0);
      }
    }

    return () => {
      if (speakingIntervalRef.current) {
        clearInterval(speakingIntervalRef.current);
      }
    };
  }, [isSpeaking]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        display: 'block',
        pointerEvents: 'auto' 
      }} 
    />
  );
}
