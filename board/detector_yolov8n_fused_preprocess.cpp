#include <stdio.h>
#include <math.h>
#include <time.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <opencv2/opencv.hpp>
#include "cviruntime.h"


typedef struct {
  float x, y, w, h;
} box;

typedef struct {
  box bbox;
  int cls;
  float score;
  int batch_idx;
} detection;

static const char *class_names[] = { "tennis ball" };

static void usage(char **argv) {
  printf("Usage:\n");
  printf("   %s cvimodel image.jpg image_detected.jpg\n", argv[0]);
}

template <typename T>
int argmax(const T *data,
          size_t len,
          size_t stride = 1)
{
	int maxIndex = 0;
	for (size_t i = stride; i < len; i += stride)
	{
		if (data[maxIndex] < data[i])
		{
			maxIndex = i;
		}
	}
	return maxIndex;
}

float calIou(box a, box b)
{
  float area1 = a.w * a.h;
  float area2 = b.w * b.h;
  float wi = std::min((a.x + a.w / 2), (b.x + b.w / 2)) - std::max((a.x - a.w / 2), (b.x - b.w / 2));
  float hi = std::min((a.y + a.h / 2), (b.y + b.h / 2)) - std::max((a.y - a.h / 2), (b.y - b.h / 2));
  float area_i = std::max(wi, 0.0f) * std::max(hi, 0.0f);
  return area_i / (area1 + area2 - area_i);
}

static void NMS(std::vector<detection> &dets, int *total, float thresh)
{
  if (*total){
    std::sort(dets.begin(), dets.end(), [](detection &a, detection &b)
              { return b.score < a.score; });
    int new_count = *total;
    for (int i = 0; i < *total; ++i)
    {
      detection &a = dets[i];
      if (a.score == 0)
        continue;
      for (int j = i + 1; j < *total; ++j)
      {
        detection &b = dets[j];
        if (dets[i].batch_idx == dets[j].batch_idx &&
            b.score != 0 && dets[i].cls == dets[j].cls &&
            calIou(a.bbox, b.bbox) > thresh)
        {
          b.score = 0;
          new_count--;
        }
      }
    }
    std::vector<detection>::iterator it = dets.begin();
    while (it != dets.end()) {
      if (it->score == 0) {
        dets.erase(it);
      } else {
        it++;
      }
    }
    *total = new_count;
  }
}

void correctYoloBoxes(std::vector<detection> &dets,
                      int det_num,
                      int image_h,
                      int image_w,
                      int input_height,
                      int input_width) {
    float scale = std::min((float)input_width / image_w, (float)input_height / image_h);
    int new_h    = (int)(image_h * scale);
    int new_w    = (int)(image_w * scale);
    int pad_top  = (input_height - new_h) / 2;
    int pad_left = (input_width  - new_w) / 2;

    for (int i = 0; i < det_num; ++i) {
        float cx = dets[i].bbox.x;
        float cy = dets[i].bbox.y;
        float w  = dets[i].bbox.w;
        float h  = dets[i].bbox.h;

        float x1 = cx - 0.5f * w;
        float y1 = cy - 0.5f * h;
        float x2 = cx + 0.5f * w;
        float y2 = cy + 0.5f * h;

        x1 = std::max(0.0f, (x1 - pad_left) / scale);
        y1 = std::max(0.0f, (y1 - pad_top)  / scale);
        x2 = std::min((float)image_w, (x2 - pad_left) / scale);
        y2 = std::min((float)image_h, (y2 - pad_top)  / scale);

        dets[i].bbox.x = (x1 + x2) / 2.0f;
        dets[i].bbox.y = (y1 + y2) / 2.0f;
        dets[i].bbox.w = x2 - x1;
        dets[i].bbox.h = y2 - y1;
    }
}

/**
 * @brief Parse single fused output tensor from YOLOv8
 * @note output shape: [batch, 4+classes, num_boxes, 1]
 *       layout: [cx, cy, w, h, score0, score1, ...] x num_boxes
 *       coords are in input image pixel space (already decoded)
 */
int getDetections(CVI_TENSOR *output,
                  int32_t input_height,
                  int32_t input_width,
                  int classes_num,
                  CVI_SHAPE output_shape,
                  float conf_thresh,
                  std::vector<detection> &dets) {

    // output[0] is the only tensor: [batch, 4+classes, num_boxes, 1]
    int batch     = output_shape.dim[0];
    int channels  = output_shape.dim[1]; // 4 + classes_num
    int num_boxes = output_shape.dim[2];

    printf("getDetections: batch=%d channels=%d num_boxes=%d fmt=%d qscale=%f\n",
           batch, channels, num_boxes, (int)output[0].fmt, output[0].qscale);

    // Dequantize to float
    size_t count = output[0].count;
    float *data;
    bool allocated = false;
    if (output[0].fmt == CVI_FMT_FP32) {
        // Use CVI_NN_TensorPtr to ensure device->host sync
        data = (float *)CVI_NN_TensorPtr(&output[0]);
    } else {
        data = (float *)malloc(count * sizeof(float));
        allocated = true;
        float qscale = output[0].qscale;
        void *src_ptr = CVI_NN_TensorPtr(&output[0]);  // synced pointer
        if (output[0].fmt == CVI_FMT_INT8) {
            int8_t *src = (int8_t *)src_ptr;
            for (size_t i = 0; i < count; i++) data[i] = src[i] * qscale;
        } else if (output[0].fmt == CVI_FMT_UINT8) {
            uint8_t *src = (uint8_t *)src_ptr;
            for (size_t i = 0; i < count; i++) data[i] = (src[i] - output[0].zero_point) * qscale;
        } else if (output[0].fmt == CVI_FMT_BF16) {
            uint16_t *src = (uint16_t *)src_ptr;
            for (size_t i = 0; i < count; i++) {
                uint32_t v = (uint32_t)src[i] << 16;
                memcpy(&data[i], &v, sizeof(float));
            }
        } else if (output[0].fmt == CVI_FMT_INT16) {
            int16_t *src = (int16_t *)src_ptr;
            for (size_t i = 0; i < count; i++) data[i] = src[i] * qscale;
        } else {
            memset(data, 0, count * sizeof(float));
        }
    }

    int det_count = 0;
    for (int b = 0; b < batch; b++) {
        // base pointer for this batch: [channels, num_boxes]
        float *base = data + b * channels * num_boxes;
        float *cx_row = base + 0 * num_boxes;
        float *cy_row = base + 1 * num_boxes;
        float *w_row  = base + 2 * num_boxes;
        float *h_row  = base + 3 * num_boxes;

        // debug: dump first 5 raw floats and find max score
        printf("debug: first 5 raw floats: %.4f %.4f %.4f %.4f %.4f\n",
               data[0], data[1], data[2], data[3], data[4]);
        printf("debug: cx[0]=%.4f cy[0]=%.4f w[0]=%.4f h[0]=%.4f score[0]=%.4f\n",
               cx_row[0], cy_row[0], w_row[0], h_row[0], base[4*num_boxes+0]);
        // Check if ANY value in score channel is non-zero
        int nonzero_count = 0;
        float abs_max = 0;
        for (int j = 0; j < num_boxes; j++) {
            float v = base[4 * num_boxes + j];
            if (v != 0.0f) nonzero_count++;
            if (fabsf(v) > abs_max) abs_max = fabsf(v);
        }
        printf("debug: score channel: nonzero=%d/%d abs_max=%.6f\n", nonzero_count, num_boxes, abs_max);
        // Try interleaved layout [8400, 5]: data[j*5+4] = score for box j
        float max_interleaved = -1e9f;
        int max_il_j = 0;
        for (int j = 0; j < num_boxes && j < (int)(count/channels); j++) {
            float s = data[j * channels + 4];
            if (s > max_interleaved) { max_interleaved = s; max_il_j = j; }
        }
        printf("debug: interleaved[j*5+4] max=%.4f at j=%d\n", max_interleaved, max_il_j);
        printf("debug: interleaved box0: %.4f %.4f %.4f %.4f %.4f\n",
               data[0], data[1], data[2], data[3], data[4]);

        float max_s = -1e9f; int max_j = 0;
        for (int j = 0; j < num_boxes; j++) {
            float s = base[4 * num_boxes + j];
            if (s > max_s) { max_s = s; max_j = j; }
        }
        printf("debug: max_score(raw)=%.4f at box %d\n", max_s, max_j);

        for (int j = 0; j < num_boxes; j++) {
            // model output is already post-sigmoid, use raw value directly
            float max_score = -1.0f;
            int   max_cls   = 0;
            for (int c = 0; c < classes_num; c++) {
                float s = base[(4 + c) * num_boxes + j];
                if (s > max_score) { max_score = s; max_cls = c; }
            }
            if (max_score <= conf_thresh) continue;

            detection det;
            det.score     = max_score;
            det.cls       = max_cls;
            det.batch_idx = b;
            det.bbox.x    = cx_row[j];
            det.bbox.y    = cy_row[j];
            det.bbox.w    = w_row[j];
            det.bbox.h    = h_row[j];
            dets.emplace_back(det);
            det_count++;
        }
    }

    if (allocated) free(data);
    return det_count;
}

int main(int argc, char **argv) {
  int ret = 0;
  CVI_MODEL_HANDLE model;

  if (argc != 4) {
    usage(argv);
    exit(-1);
  }
  CVI_TENSOR *input;
  CVI_TENSOR *output;
  CVI_TENSOR *input_tensors;
  CVI_TENSOR *output_tensors;
  int32_t input_num;
  int32_t output_num;
  CVI_SHAPE input_shape;
  CVI_SHAPE* output_shape;
  int32_t height;
  int32_t width;
  //int bbox_len = 84; // classes num + 4
  int classes_num = 1;
  float conf_thresh = 0.5;
  float iou_thresh = 0.5;
  ret = CVI_NN_RegisterModel(argv[1], &model);
  if (ret != CVI_RC_SUCCESS) {
    printf("CVI_NN_RegisterModel failed, err %d\n", ret);
    exit(1);
  }
  printf("CVI_NN_RegisterModel succeeded\n");

  // get input output tensors
  CVI_NN_GetInputOutputTensors(model, &input_tensors, &input_num, &output_tensors,
                               &output_num);

  input = CVI_NN_GetTensorByName(CVI_NN_DEFAULT_TENSOR, input_tensors, input_num);
  assert(input);
  output = output_tensors;
  printf("debug: output_num=%d\n", output_num);
  output_shape = reinterpret_cast<CVI_SHAPE *>(calloc(output_num, sizeof(CVI_SHAPE)));
  for (int i = 0; i < output_num; i++)
  {
    output_shape[i] = CVI_NN_TensorShape(&output[i]);
    printf("debug: output[%d] shape=[%d,%d,%d,%d] fmt=%d count=%zu qscale=%f\n",
           i, output_shape[i].dim[0], output_shape[i].dim[1],
           output_shape[i].dim[2], output_shape[i].dim[3],
           (int)output[i].fmt, output[i].count, output[i].qscale);
  }

  // nchw
  input_shape = CVI_NN_TensorShape(input);
  height = input_shape.dim[2];
  width = input_shape.dim[3];
  assert(height % 32 == 0 && width %32 == 0);
  // imread
  cv::Mat image;
  image = cv::imread(argv[2]);
  if (!image.data) {
    printf("Could not open or find the image\n");
    return -1;
  }
  cv::Mat cloned = image.clone();

  // resize & letterbox
  int ih = image.rows;
  int iw = image.cols;
  int oh = height;
  int ow = width;
  double resize_scale = std::min((double)oh / ih, (double)ow / iw);
  int nh = (int)(ih * resize_scale);
  int nw = (int)(iw * resize_scale);
  cv::resize(image, image, cv::Size(nw, nh));
  int top = (oh - nh) / 2;
  int bottom = (oh - nh) - top;
  int left = (ow - nw) / 2;
  int right = (ow - nw) - left;
  cv::copyMakeBorder(image, image, top, bottom, left, right, cv::BORDER_CONSTANT,
                     cv::Scalar::all(0));
  cv::cvtColor(image, image, cv::COLOR_BGR2RGB);

  // Fill input tensor based on its format
  printf("debug: input fmt=%d qscale=%f zero_point=%d\n", (int)input->fmt, input->qscale, input->zero_point);
  int channel_size = height * width;

  if (input->fmt == CVI_FMT_FP32) {
    // TPU-MLIR bakes normalization into the model, feed raw [0,255] as float
    cv::Mat channels_f[3];
    cv::Mat image_f;
    image.convertTo(image_f, CV_32FC3, 1.0);
    cv::split(image_f, channels_f);
    float *ptr = (float *)CVI_NN_TensorPtr(input);
    for (int i = 0; i < 3; ++i) {
      memcpy(ptr + i * channel_size, channels_f[i].data, channel_size * sizeof(float));
    }
  } else {
    // INT8/UINT8 fused preprocess: copy raw bytes
    cv::Mat channels_b[3];
    for (int i = 0; i < 3; i++) {
      channels_b[i] = cv::Mat(image.rows, image.cols, CV_8UC1);
    }
    cv::split(image, channels_b);
    uint8_t *ptr = (uint8_t *)CVI_NN_TensorPtr(input);
    for (int i = 0; i < 3; ++i) {
      memcpy(ptr + i * channel_size, channels_b[i].data, channel_size);
    }
  }

  // run inference
  struct timeval t0, t1;
  gettimeofday(&t0, NULL);
  CVI_NN_Forward(model, input_tensors, input_num, output_tensors, output_num);
  gettimeofday(&t1, NULL);
  long elapsed_ms = (t1.tv_sec - t0.tv_sec) * 1000 + (t1.tv_usec - t0.tv_usec) / 1000;
  printf("CVI_NN_Forward Succeed... elapsed: %ld ms\n", elapsed_ms);

  // do post proprocess
  int det_num = 0;
  std::vector<detection> dets;
  det_num = getDetections(output, height, width, classes_num, output_shape[0],  
                          conf_thresh, dets);
  // correct box with origin image size
  NMS(dets, &det_num, iou_thresh);
  // bbox is in input_image space (cx,cy,w,h), map back to original image
  correctYoloBoxes(dets, det_num, cloned.rows, cloned.cols, height, width);

  // draw bbox on image
  for (int i = 0; i < det_num; i++) {
    box b = dets[i].bbox;
    // xywh2xyxy
    int x1 = (b.x - b.w / 2);
    int y1 = (b.y - b.h / 2);
    int x2 = (b.x + b.w / 2);
    int y2 = (b.y + b.h / 2);
    cv::rectangle(cloned, cv::Point(x1, y1), cv::Point(x2, y2), cv::Scalar(255, 255, 0),
                  3, 8, 0);
    char content[100];
    sprintf(content, "%s %0.3f", class_names[dets[i].cls], dets[i].score);
    cv::putText(cloned, content, cv::Point(x1, y1),
                cv::FONT_HERSHEY_DUPLEX, 1.0, cv::Scalar(0, 0, 255), 2);
  }

  // save or show picture
  cv::imwrite(argv[3], cloned);

  printf("------\n");
  printf("%d objects are detected\n", det_num);
  printf("------\n");

  CVI_NN_CleanupModel(model);
  printf("CVI_NN_CleanupModel succeeded\n");
  free(output_shape);
  return 0;
}