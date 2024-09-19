from flask import Flask, jsonify, request
from pyngrok import ngrok,conf
import requests
import pandas as pd
import matplotlib.pyplot as plt
from pymongo import MongoClient
import matplotlib.font_manager as fm
from bson.objectid import ObjectId
import numpy as np
import tensorflow as tf
import datetime
import time
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
import matplotlib.patches as mpatches
import librosa
import librosa.display
from pydub import AudioSegment
from scipy.fft import fft
from threading import Thread
import io
import os

#flask 및 몽고디비 connection string 선언, 0918 수정
app = Flask(__name__)
connection_string = 'mongodb://localhost:27017'
#connection_string = 'mongodb+srv://hansunguniv001:hansung@cluster0.hlw86l4.mongodb.net/'

# FFmpeg 경로 설정
AudioSegment.converter = "C:\\Users\\sohee\\ffmpeg\\ffmpeg-n7.0-latest-win64-gpl-7.0\\bin\\ffmpeg.exe"
AudioSegment.ffmpeg = "C:\\Users\\sohee\\ffmpeg\\ffmpeg-n7.0-latest-win64-gpl-7.0\\bin\\ffmpeg.exe"
AudioSegment.ffprobe = "C:\\Users\\sohee\\ffmpeg\\ffmpeg-n7.0-latest-win64-gpl-7.0\\bin\\ffprobe.exe"

#0802 추가
flag = None

# MongoDB 클라이언트 설정 0918 수정
client = MongoClient(connection_string)
db = client['mydatabase']  # 데이터베이스 이름, 0918 수정

control_collection = db['coeffie_control']
record_collection = db['coeffie_record']
control_mfcc_avg = db['coeffie_control_avg']
record_mfcc_avg = db['coeffie_record_avg']
file_record_db = db['file_record']
file_control_db = db['file_control']

#모델 훈련 관련 파라미터
batch_size = 64
pca = PCA(n_components=2)

# - 부호 깨지는 문제 ->  유니코드 설정
plt.rcParams['axes.unicode_minus'] = False

# 한글 폰트 경로 설정
font_path = r'C:\Windows\Fonts\HMFMMUEX.TTC'  # Windows의 윤고딕 폰트 파일 불러옴

# 폰트 속성 설정
font_prop = fm.FontProperties(fname=font_path, size=12)
plt.rc('font', family=font_prop.get_name())

# 모델 구성
model = tf.keras.Sequential([
    tf.keras.layers.Dense(64, activation='relu', input_shape=(12,)),  # 입력 형태는 12개의 특징을 가진 MFCC 벡터
    tf.keras.layers.BatchNormalization(),
    tf.keras.layers.LeakyReLU(alpha=0.01),
    tf.keras.layers.Dense(32, activation='tanh'),
    tf.keras.layers.Dropout(0.4),
    tf.keras.layers.Dense(16, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.001)),
    tf.keras.layers.Dense(1, activation='sigmoid')
])

model2 = tf.keras.Sequential([
    tf.keras.layers.Dense(32, activation='relu', input_shape=(1,)),  # 입력 형태는 1개의 특징
    tf.keras.layers.Dropout(0.3),  
    tf.keras.layers.Dense(16, activation='relu'),  
    tf.keras.layers.Dense(1, activation='sigmoid')  # 이진 분류를 위한 출력 레이어
])

model3 = tf.keras.Sequential([
    tf.keras.layers.Dense(32, activation='relu', input_shape=(1,)),  # 입력 형태는 1개의 특징
    tf.keras.layers.Dropout(0.3),  
    tf.keras.layers.Dense(16, activation='relu'),  
    tf.keras.layers.Dense(1, activation='sigmoid')  # 이진 분류를 위한 출력 레이어
])

model5 = tf.keras.Sequential([
    tf.keras.layers.Dense(32, activation='relu', input_shape=(1,)),  # 입력 형태는 1개의 특징
    tf.keras.layers.Dropout(0.3),  
    tf.keras.layers.Dense(16, activation='relu'),  
    tf.keras.layers.Dense(1, activation='sigmoid')  # 이진 분류를 위한 출력 레이어
])

model6 = tf.keras.Sequential([
    tf.keras.layers.Dense(32, activation='relu', input_shape=(1,)),  # 입력 형태는 1개의 특징
    tf.keras.layers.Dropout(0.3),  
    tf.keras.layers.Dense(16, activation='relu'),  
    tf.keras.layers.Dense(1, activation='sigmoid')  # 이진 분류를 위한 출력 레이어
])

model8 = tf.keras.Sequential([
    tf.keras.layers.Dense(32, activation='relu', input_shape=(1,)),  # 입력 형태는 1개의 특징
    tf.keras.layers.Dropout(0.3),  
    tf.keras.layers.Dense(16, activation='relu'),  
    tf.keras.layers.Dense(1, activation='sigmoid')  # 이진 분류를 위한 출력 레이어
])

# 필요한 전역변수들
mfcc_record_train_values = None
mfcc_record_test_values = None
mfcc_control_train_values = None
mfcc_control_test_values = None
combined_labels = None
control_predicted_labels = None
record_predicted_labels = None
combined_mfcc = None
files_control_id = None
files_record_id = None
mfcc_control_data = None
mfcc_record_data = None

mfcc_nums = [2, 3, 5, 6, 8]
record_values_list = []
control_values_list = []
record_train_values = []
record_test_values = []
control_train_values = []
control_test_values = []
combined_mfcc_list = []
combined_labels_list = []
similarity_score_list = []

def read_wav_file(file_path):
    audio = AudioSegment.from_file(file_path)
    audio = audio.set_frame_rate(44100).set_channels(1).set_sample_width(2)
    samples = np.array(audio.get_array_of_samples())
    return 44100, samples

@app.route('/')
def start():
    return "Hello ngrok!"


@app.route('/import_dataset', methods=['GET'])
def import_dataset():
    global mfcc_control_test_values, mfcc_control_train_values, mfcc_record_test_values, mfcc_record_train_values, mfcc_control_data, mfcc_record_data, files_control_id, files_record_id, \
           mfcc_nums, record_values_list, control_values_list, record_train_values, record_test_values, control_train_values, control_test_values, flag
    
    # 표준화 선언
    scaler = StandardScaler()
    
    # file_control_db에서 가장 최근 레코드 하나 조회
    latest_file_control = file_control_db.find_one(sort=[('_id', -1)])
    flag = latest_file_control['flag'] if latest_file_control and 'flag' in latest_file_control else None
    print(f"flag value: {flag}")  # flag 값 출력
    
    # 가장 최근 데이터 하나만 조회
    latest_coef_control = control_collection.find_one(sort=[('_id', -1)])
    files_control_id = latest_coef_control['files_control_id'] if latest_coef_control and 'files_control_id' in latest_coef_control else None
    print(files_control_id)  # id 테스트 출력
    
    control_cursor = control_collection.find({'files_control_id': files_control_id})  # id에 해당하는 레코드들만 가져옴
    mfcc_control_data = pd.DataFrame(list(control_cursor))

    # 가장 최근 레코드 가져오기
    latest_coef_record = record_collection.find_one(sort=[('_id', -1)])
    files_record_id = latest_coef_record['files_record_id'] if latest_coef_record and 'files_record_id' in latest_coef_record else None
    print(files_record_id)  # id 테스트 출력
    
    record_cursor = record_collection.find({'files_record_id': files_record_id})  # id에 해당하는 레코드들만 가져옴
    mfcc_record_data = pd.DataFrame(list(record_cursor))
    
    #default -> 모든 MFCC 계수 학습
    #필요한 열만 선택 (예: MFCC1부터 MFCC12까지) -> 추후 그래프 만드는데 쓰임 -> 건들지 말기
    mfcc_control_data = mfcc_control_data.loc[:, 'MFCC1':'MFCC12']
    mfcc_record_data = mfcc_record_data.loc[:, 'MFCC1':'MFCC12'] 
        
    # DataFrame에서 numpy 배열로 변환
    mfcc_record_values = mfcc_record_data.to_numpy()
    mfcc_control_values = mfcc_control_data.to_numpy()
        
    normalized_record_values = scaler.fit_transform(mfcc_record_values)
    normalized_control_values = scaler.transform(mfcc_control_values)
        
    # 데이터를 8:2 비율로 train과 test로 분리
    mfcc_record_train_values, mfcc_record_test_values = train_test_split(normalized_record_values, test_size=0.2,
                                                                         random_state=42)
    mfcc_control_train_values, mfcc_control_test_values = train_test_split(normalized_control_values, test_size=0.2,
                                                                           random_state=42)
    
    #아나운서 기능인 경우
    if(flag == 3):
        #리스트 초기화 
        record_train_values = []
        record_test_values = []
        control_train_values = []
        control_test_values = []
        
        #0801 수정, 특정 MFCC 계수만 추출하기 -> 특정 계수는 라우트 따로 만들어서 처리 or if-else 문 만들기
        for num in mfcc_nums:
            record_values = mfcc_control_data[f'MFCC{num}'].to_numpy()
            control_values = mfcc_record_data[f'MFCC{num}'].to_numpy()

            record_values = scaler.fit_transform(record_values.reshape(-1, 1)).flatten()
            control_values = scaler.transform(control_values.reshape(-1, 1)).flatten()

            #record_values_list.append(record_values)
            #control_values_list.append(control_values)
    
            # 데이터를 8:2 비율로 train과 test로 분리
            rec_train_values, rec_test_values = train_test_split(record_values, test_size=0.2,
                                                                         random_state=42)
            con_train_values, con_test_values = train_test_split(control_values, test_size=0.2,
                                                                           random_state=42)
            record_train_values.append (rec_train_values)
            record_test_values.append(rec_test_values)
            control_train_values.append(con_train_values)
            control_test_values.append(con_test_values)
            
    return "import label completed!"

@app.route('/label_setting', methods=['GET'])
def labeling():
    #전역 변수 선언
    global combined_labels, combined_mfcc, mfcc_control_train_values, mfcc_record_train_values, flag, \
           combined_mfcc_list, combined_labels_list, record_train_values, control_train_values, mfcc_nums

    # 클러스터링을 위한 KMeans 모델 생성
    kmeans = KMeans(n_clusters=2, n_init = 12)
    
    #아나운서 기능인 경우
    if(flag == 3):
        #초기화 
        combined_mfcc_list = []
        combined_labels_list = []
        for i in range(len(mfcc_nums)):
            combined2_mfcc = np.concatenate((control_train_values[i].reshape(-1, 1), record_train_values[i].reshape(-1, 1)), axis=0)
            kmeans.fit(combined2_mfcc)
            combined2_labels = kmeans.labels_
            
            combined_mfcc_list.append(combined2_mfcc)
            combined_labels_list.append(combined2_labels)
        
    # control_mfcc와 record_mfcc를 합친 데이터셋 생성
    combined_mfcc = np.concatenate((mfcc_control_train_values, mfcc_record_train_values), axis=0)

    # combined_mfcc에 대해 클러스터링 수행
    kmeans.fit(combined_mfcc)

    # 클러스터링 결과를 레이블로 사용
    combined_labels = kmeans.labels_

    # PCA를 사용해 데이터를 2차원으로 축소
    reduced_data = pca.fit_transform(combined_mfcc)

    # 레이블에 따라 색상을 지정
    colors = ['purple' if label == 0 else 'darkorange' for label in combined_labels]

    # 그래프 생성
    fig, ax = plt.subplots()
    ax.scatter(reduced_data[:, 0], reduced_data[:, 1], c=colors)

    # 클러스터 중심을 플롯
    centers = pca.transform(kmeans.cluster_centers_)
    ax.scatter(centers[:, 0], centers[:, 1], c='black', s=200, alpha=0.5)

    # 범례 추가
    purple_patch = mpatches.Patch(color='purple', label='Label 0')
    yellow_patch = mpatches.Patch(color='darkorange', label='Label 1')
    ax.legend(handles=[purple_patch, yellow_patch])
    
    # 축 한계 설정
    ax.set_xlim([-10, 10])  # x축 범위 설정
    ax.set_ylim([-10, 10])  # y축 범위 설정

    ax.set_title('녹취 파일 & 실시간 파일 클러스트링 결과 그래프')

    # 이미지를 메모리에 저장
    img = io.BytesIO()
    fig.savefig(img, format='png')
    img.seek(0)

    # 이미지 파일로 저장
    with open(f'images/clustering_label_{files_control_id}.png', 'wb') as f:
        f.write(img.getbuffer())

    #Node.js 서버로 이미지 전송
    # with open(f'images/clustering_label_{files_control_id}.png', 'rb') as f:
    #     response = requests.post('http://localhost:3000/upload_image', files={'image': f})  # Node.js 서버 포트는 3000입니다.
    #     print(response.text)

    return "label setting completed!"

@app.route('/training', methods=['GET'])
def training():
    global combined_labels, combined_mfcc, flag, combined_mfcc_list, combined_labels_list, flag, model, \
        model2, model3, model5, model6, model8

    if combined_labels is None:
        return jsonify({"error": "Labels not set. Please run /label_setting first."}), 400
    
    #================================== default training ===============================#
    # 데이터 분리 없이 전체 데이터를 사용
    train_data = combined_mfcc
    train_labels = combined_labels

    # TensorFlow 데이터셋 생성
    train_dataset = tf.data.Dataset.from_tensor_slices((train_data, train_labels)).batch(batch_size)


    # 모델 컴파일
    model.compile(optimizer='rmsprop',
                    loss='binary_crossentropy',
                    metrics=['accuracy'])

    # 모델 컴파일 및 학습
    history = model.fit(train_dataset, epochs=10)
    
    #================================== default training ===============================#
    
    #================================== 추가 training ===============================#
    #flag == 3일 때 (아나운서 기능일 때)
    if(flag == 3):
        # 모델을 각 딕셔너리로 관리 
        models = {
            2: model2,
            3: model3,
            5: model5,
            6: model6,
            8: model8
        }
        
        for i in range(len(mfcc_nums)):
            # TensorFlow 데이터셋 생성
            train_dataset = tf.data.Dataset.from_tensor_slices((combined_mfcc_list[i], combined_labels_list[i])).batch(batch_size)

            #모델 정의
            each_model = models[mfcc_nums[i]]
            
            # 모델 컴파일
            each_model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.008),  # 학습률 조정
                    loss='binary_crossentropy',
                    metrics=['accuracy'])
        
            # 모델 컴파일 및 학습
            each_model.fit(train_dataset, epochs=10)
            
            # 각 MFCC 계수에 대한 학습 결과를 출력합니다.
            print(f"MFCC{mfcc_nums[i]} training completed.")
    #================================== 추가 training ===============================#
    

    # 두 번째 그래프 생성 (학습 손실과 정확도)
    fig, ax = plt.subplots(1, 2, figsize=(20, 6))  # 가로로 길고 세로로 짧게 설정

    # 학습 손실 값
    ax[0].plot(history.history['loss'], label='실제 값과 모델의 예측값 간의 오차율')
    ax[0].set_xlabel('훈련 횟수', fontsize=14)
    ax[0].set_ylabel('오차율', fontsize=14)
    ax[0].set_title('훈련 횟수에 따른 모델의 오차율', fontsize=14)
    ax[0].legend()

    # 학습 정확도 값
    ax[1].plot(history.history['accuracy'], label='모델의 정확도', color='red')
    ax[1].set_xlabel('훈련 횟수', fontsize=14)
    ax[1].set_ylabel('정확도', fontsize=14)  # 수정: 정확도에 맞는 y축 레이블
    ax[1].set_title('훈련 횟수에 따른 모델의 정확도', fontsize=14)
    ax[1].legend()

    fig.tight_layout()

    # 이미지를 메모리에 저장
    img = io.BytesIO()
    fig.savefig(img, format='png')
    img.seek(0)

    # 이미지 파일로 저장 -> files_control_id 참조할 수 있도록
    with open(f'images/train_acc_loss_{files_control_id}.png', 'wb') as f:
        f.write(img.getbuffer())

    return "Training completed!"

@app.route('/model_predict', methods=['GET'])
def model_predict():
    #global 전역 변수 선언
    global mfcc_control_test_values, mfcc_record_test_values, db, control_predicted_labels, record_predicted_labels, files_control_id, files_record_id, \
           flag, control_test_values, record_train_values, model, model2, model3, model5, model6, model8, mfcc_nums, similarity_score_list

    #================================== default prediction =====================================//
    control_predictions = model.predict(mfcc_control_test_values)
    control_predicted_labels = (control_predictions > 0.5).astype(int).flatten()
    control_average_prediction = np.mean(control_predicted_labels)
    print(f"실시간 음성 녹음 화자에 대한 모델의 예측값 평균 : {control_average_prediction:.4f}")

    # record_mfcc 데이터셋에서 모델 예측
    record_predictions = model.predict(mfcc_record_test_values)
    record_predicted_labels = (record_predictions > 0.5).astype(int).flatten()
    record_average_prediction = np.mean(record_predicted_labels)
    print(f"증거 자료 녹음 화자에 대한 모델의 예측값 평균 : {record_average_prediction:.4f}")

    # 평균 절대 오차 계산
    mae = np.abs(control_average_prediction - record_average_prediction)

    # 유사도 점수 계산
    # 가정: 최대 MAE는 1 (예측값의 범위가 0에서 1일 때)
    max_mae = 1
    similarity_score = 1 - (mae / max_mae)

    print(f"평균 절대 오차(MAE): {mae:.4f}")
    print(f"유사도 점수: {similarity_score:.4f}")
    #================================== default prediction =====================================//
    
    #================================== FLAG == 3인 경우 =====================================//
    #flag == 3인 경우 추가 
    if(flag == 3):
        similarity_score_list = []
        #각 MFCC 계수를 딕셔너리로 관리
        models = {
            2: model2,
            3: model3,
            5: model5,
            6: model6,
            8: model8
        }
        
        for i in range(len(mfcc_nums)):
            each_model = models[mfcc_nums[i]]
            
            control_prediction = each_model.predict(control_test_values[i])
            control_predicted_label = (control_prediction > 0.5).astype(int).flatten()
            control_avg_pred = np.mean(control_predicted_label)
            
            print(f"실시간 음성 녹음 화자에 대한 MFCC{mfcc_nums[i]} 모델의 예측값 평균 : {control_avg_pred:.4f}")
            
            record_prediction = each_model.predict(record_test_values[i])
            record_prediction_label = (record_prediction > 0.5).astype(int).flatten()
            record_avg_pred = np.mean(record_prediction_label)
            print(f"증거 자료 녹음 화자에 대한 MFCC{mfcc_nums[i]} 모델의 예측값 평균 : {record_avg_pred:.4f}")
            
            #평균 절대 오차 계산
            each_mae = np.abs(control_avg_pred - record_avg_pred)
            
            #유사도 점수 계산
            max_mae = 1
            each_similarity_score = 1 - (each_mae / max_mae)
            
            #유사도 리스트에 저장
            similarity_score_list.append(round(each_similarity_score, 4)*100)
            print(f"MFCC{mfcc_nums[i]} 유사도 점수: {each_similarity_score:.4f}")
    
    #================================== FLAG == 3인 경우 =====================================//
    # 현재 시간을 UTC로 구하기
    current_time = datetime.datetime.utcnow()
    # 소수점 네 자리까지 반올림
    record_average_prediction = round(record_average_prediction, 4)
    control_average_prediction = round(control_average_prediction, 4)
    similarity_score = round(similarity_score, 4)

    data = {
        "live_data_prediction" : record_average_prediction, #녹취록에 대한 모델의 예측 평균
        "record_data_prediction" : control_average_prediction, #실시간 데이터에 대한 모델의 예측 평균
        "files_record_id" : ObjectId(files_record_id), #record_files_id에 해당 하는 값
        "files_control_id" : ObjectId(files_control_id), #control_files_id에 해당하는 값
        #"timestamp" : current_time
    }
    
    # flag 값에 따라서 필드에 값을 할당
    if flag == 1:
        data["result_MAE_similarity"] = similarity_score * 100  # 계산된 정확도
        data["ai_voice_MAE_similarity"] = None
        data["announcer_MAE_similarity"] = None
        data["mfcc_acc_list"] = None
    elif flag == 2:
        data["result_MAE_similarity"] = None
        data["ai_voice_MAE_similarity"] = similarity_score * 100  # 계산된 정확도
        data["announcer_MAE_similarity"] = None
        data["mfcc_acc_list"] = None
    elif flag == 3:
        data["result_MAE_similarity"] = None
        data["ai_voice_MAE_similarity"] = None
        data["announcer_MAE_similarity"] = similarity_score * 100  # 계산된 정확도
        data["mfcc_acc_list"] = similarity_score_list
    
    data["timestamp"] = current_time

    # 몽고 디비 results 컬렉션에 데이터 삽입
    result = db['results'].insert_one(data)
    return "Data inserted with record id : {}".format(result.inserted_id)

@app.route('/mfcc_spectrum', methods=['GET'])
def mfcc_spectrum():
    global mfcc_control_data, mfcc_record_data
    def safe_float_convert(value):
        try:
            return float(value)
        except ValueError:
            return np.nan

    # CSV 파일에서 오디오 데이터 추출 및 정규화
    def process_and_normalize_mfccs(data):
        mfcc_data = data.iloc[1:, 2:14].applymap(safe_float_convert).to_numpy()
        # 각 계수별로 정규화
        mfcc_data -= mfcc_data.min(axis=0)  # 최소값을 0으로 조정
        mfcc_data /= mfcc_data.max(axis=0)  # 최대값으로 나누어 0과 1 사이로 조정
        return mfcc_data.flatten()

    audio_data1 = process_and_normalize_mfccs(mfcc_record_data)
    audio_data2 = process_and_normalize_mfccs(mfcc_control_data)

    sr = 22050  # 샘플 레이트

    # 데이터 정규화를 위한 수정된 함수
    def normalize_positive_mfcc(mfcc_data):
        mfcc_data = np.maximum(mfcc_data, 0)  # 음수 값 제거
        mfcc_data /= np.max(mfcc_data)  # 최대값으로 나누어 스케일링
        return mfcc_data

    # MFCC 계산
    mfccs1 = librosa.feature.mfcc(y=audio_data1, sr=sr, n_mfcc=13)
    mfccs2 = librosa.feature.mfcc(y=audio_data2, sr=sr, n_mfcc=13)

    # 정규화 수행
    mfccs1 = normalize_positive_mfcc(mfccs1)
    mfccs2 = normalize_positive_mfcc(mfccs2)

    # 시각화
    fig, axes = plt.subplots(nrows=1, ncols=2, figsize=(14, 6))
    img1 = librosa.display.specshow(mfccs1, sr=sr, x_axis='time', ax=axes[0], cmap='coolwarm')
    axes[0].set_title('증거물 녹취 파일 MFCC Spectrum', fontsize=14)
    axes[0].set_xlabel('Time', fontsize=14)
    axes[0].set_ylabel('MFCC Coefficients', fontsize=14)
    fig.colorbar(img1, ax=axes[0])

    img2 = librosa.display.specshow(mfccs2, sr=sr, x_axis='time', ax=axes[1], cmap='coolwarm')
    axes[1].set_title('실시간 파일 MFCC Spectrum', fontsize=14)
    axes[1].set_xlabel('Time', fontsize=14)
    axes[1].set_ylabel('MFCC Coefficients', fontsize=14)
    fig.colorbar(img2, ax=axes[1])

    # 전체 그림에 대한 서브 타이틀 설정
    fig.suptitle('위 그래프는 MFCC 계수값들을 정규화하여 최소 0, 최대 1의 실수값들의 분포를 표현한 것입니다', fontsize=16)
    # Layout 조정 전에 서브 타이틀이 그래프에 영향을 주지 않도록 조정
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])  # rect는 [left, bottom, right, top] 형태로 조정
    plt.tight_layout()

    # 이미지를 메모리에 저장
    img = io.BytesIO()
    fig.savefig(img, format='png')
    img.seek(0)

    # 이미지 파일로 저장
    with open(f'images/mfcc_spectrum_graph_{files_control_id}.png', 'wb') as f:
        f.write(img.getbuffer())

    return "mfcc_spectrum_graph.png processed!"


@app.route('/mfcc_bar_graph', methods=['GET'])
def mfcc_bar_graph():
    global mfcc_control_data, mfcc_record_data
    control_means = {}
    record_means = {}
    control_avg_data = {}
    record_avg_data = {}
    
    # mfcc1을 먼저 저장(그래프에서는 MFCC2부터 시작하므로)
    control_avg_data['MFCC1'] = pd.to_numeric(mfcc_control_data['MFCC1'], errors='coerce').mean()
    record_avg_data['MFCC1'] = pd.to_numeric(mfcc_record_data['MFCC1'], errors='coerce').mean()

    for column_name in mfcc_control_data.columns[1:14]:  # mfcc1을 제외하고 나머지 열에 대해 반복
        try:
            # 첫 번째 데이터프레임에서 각 열에서 숫자로 변환 가능한 값만 필터링
            control_data = pd.to_numeric(mfcc_control_data[column_name], errors='coerce')
            control_mfcc_mean = control_data.mean()
            control_means[column_name] = control_mfcc_mean

            # 두 번째 데이터프레임에서 각 열에서 숫자로 변환 가능한 값만 필터링
            record_data = pd.to_numeric(mfcc_record_data[column_name], errors='coerce')
            record_mfcc_mean = record_data.mean()
            record_means[column_name] = record_mfcc_mean

            # MongoDB에 저장할 데이터에 MFCC 계수를 추가 
            control_avg_data[column_name] = control_mfcc_mean
            record_avg_data[column_name] = record_mfcc_mean
        except ValueError:
            # 변환할 수 없는 값이 있는 경우 예외 처리
            print(f'{column_name} 열에 변환할 수 없는 값이 있습니다.')

    # MongoDB에 평균 MFCC 데이터들 삽입
    # 현재 시간을 UTC로 구하기
    current_time = datetime.datetime.utcnow()
    
    #file_id 추가
    control_avg_data["files_control_id"] = ObjectId(files_control_id)
    record_avg_data["files_record_id"] = ObjectId(files_record_id)
    
    # timestamp 필드 추가
    control_avg_data["timestamp"] = current_time
    record_avg_data["timestamp"] = current_time
    
    control_result = control_mfcc_avg.insert_one(control_avg_data)
    record_result = record_mfcc_avg.insert_one(record_avg_data)

    print("Control MFCC averages inserted with id:", control_result.inserted_id)
    print("Record MFCC averages inserted with id:", record_result.inserted_id)

    # 막대그래프로 시각화
    labels = control_means.keys()  # x축 레이블
    means1 = control_means.values()  # 첫 번째 CSV 파일의 평균값
    means2 = record_means.values()  # 두 번째 CSV 파일의 평균값

    x = np.arange(len(labels))  # 레이블 위치
    width = 0.35  # 막대 너비

    fig, ax = plt.subplots(figsize=(12, 8))
    bars1 = ax.bar(x - width / 2, means1, width, label='실시간 파일 MFCC 평균값')
    bars2 = ax.bar(x + width / 2, means2, width, label='녹취록 파일 MFCC 평균값')

    # 레이블, 제목 및 눈금 설정
    ax.set_xlabel('MFCC 계수들', fontsize=14)
    ax.set_ylabel('평균 값', fontsize=14)
    ax.set_title('녹취록과 실시간 음성 파일 간 MFCC 계수 평균값 비교', fontsize=16)
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.legend()

    # 막대 위에 값 표시
    def add_labels(bars):
        for bar in bars:
            height = bar.get_height()
            ax.annotate(f'{height:.2f}',  # 막대 위에 표시할 텍스트
                        xy=(bar.get_x() + bar.get_width() / 2, height),  # 텍스트 위치
                        xytext=(0, 3),  # 텍스트와 막대 사이의 거리
                        textcoords="offset points",
                        ha='center', va='bottom')

    add_labels(bars1)
    add_labels(bars2)

    plt.xticks(rotation=45)
    plt.tight_layout()

    # 이미지를 메모리에 저장
    img = io.BytesIO()
    fig.savefig(img, format='png')
    img.seek(0)

    # 이미지 파일로 저장
    with open(f'images/mfcc_bar_graph_{files_control_id}.png', 'wb') as f:
        f.write(img.getbuffer())

    return "mfcc_bar_graph.png processed!"

@app.route('/fft_spectrum', methods=['GET'])
def fft_spectrum():
    #1. record_file wav 파일 경로 읽어서 data 저장 (전처리)
    record_each = file_record_db.find_one({"_id": ObjectId(files_record_id)})
    if record_each:
        record_file_path = record_each.get('path')
        print(record_file_path)
        if record_file_path and os.path.exists(record_file_path):
            record_sample_rate, record_data = read_wav_file(record_file_path)
            # 1분(60초)의 데이터만 사용
            record_data = record_data[:record_sample_rate * 60]
        else:
            print("record File path does not exist.")
    else:
        print("Record not found.")
        
    #2. control_file wav 파일 경로 읽어서 data 저장 (전처리)
    control_each = file_control_db.find_one({"_id": ObjectId(files_control_id)})
    if control_each:
        control_file_path = control_each.get('path')
        print(control_file_path)
        if control_file_path and os.path.exists(control_file_path):
            control_sample_rate, control_data = read_wav_file(control_file_path)
            # 1분(60초)의 데이터만 사용
            control_data = control_data[:control_sample_rate * 60]
        else:
            print("control File path does not exist.")
    else:
        print("Control not found.")
        
    #3. FFT 계산
    record_y = fft(record_data)
    control_y = fft(control_data)
    
    #4. 주파수 축 생성 
    record_x = np.linspace(0.0, record_sample_rate / 2.0, len(record_data) // 2)
    control_x = np.linspace(0.0, control_sample_rate / 2.0, len(control_data) // 2)
    
    #5. dB(데시벨) 단위 변환 -> y변수에 로그를 취하면 dB(데시벨) 단위가 됨
    record_dB = 20 * np.log10(2.0 / len(record_data) * np.abs(record_y[:len(record_data) // 2]))
    control_dB = 20 * np.log10(2.0 / len(control_data) * np.abs(control_y[:len(control_data) // 2]))
    
    # 그래프 그리기
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    ax1.plot(record_x, record_dB, label='녹취 파일', color='orange')
    ax1.set_title('녹취 파일 주파수 스펙트럼', fontsize=14)
    ax1.set_xlabel('Frequency (Hz)', fontsize=14)
    ax1.set_ylabel('Amplitude (dB)', fontsize=14)
    ax1.set_ylim([-80, 30])  # y축 범위 설정
    ax1.grid(True)

    ax2.plot(control_x, control_dB, label='실시간 음성 파일', color='green', alpha=0.75)
    ax2.set_title('실시간 음성 파일 주파수 스펙트럼', fontsize=14)
    ax2.set_xlabel('Frequency (Hz)', fontsize=14)
    ax2.set_ylabel('Amplitude (dB)', fontsize=14)
    ax2.set_ylim([-80, 30])  # y축 범위 설정
    ax2.grid(True)

    plt.suptitle('녹취록 / 실시간 음성의 주파수 스펙트럼 비교', fontsize=16)
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    
    # 이미지를 메모리에 저장
    img = io.BytesIO()
    plt.savefig(img, format='png')
    img.seek(0)
        
    # 이미지 파일로 저장
    with open(f'images/fft_spectrum_{files_control_id}.png', 'wb') as f:
        f.write(img.getbuffer())
    
    plt.close()
    
    return "fft_spectrum.png processed!"
    
if __name__ == '__main__':
    # ngrok을 통해 외부 접근 가능하도록 설정
    public_url = ngrok.connect(5000, bind_tls=True).public_url  # 포트 번호와 함께 bind_tls 옵션 설정
    print(f" * ngrok tunnel \"{public_url}\" -> \"http://127.0.0.1:5000\"")

    # Flask 서버가 시작될 시간을 기다림
    time.sleep(2)  # 필요한 경우 더 길게 조정
    
    # Flask 앱을 별도의 스레드에서 실행합니다.
    from threading import Thread
    def run_flask():
        app.run(port=5000)

    flask_thread = Thread(target=run_flask)
    flask_thread.start()
    
    #Run the Flask app in the main thread
    # app.run(port=5000)
    
    #라우트를 자동으로 호출 -> 테스트 실행용
    # response = requests.get(public_url + '/import_dataset')
    # print("Response from /import_dataset route:", response.text)
    
    # response = requests.get(public_url + '/label_setting')
    # print("Response from /label_setting route:", response.text)
    
    # response = requests.get(public_url + '/mfcc_bar_graph')
    # print("Response from /mfcc_bar_graph route:", response.text)
    
    # response = requests.get(public_url + '/mfcc_spectrum')
    # print("Response from /mfcc_spectrum route:", response.text)
    
    # response = requests.get(public_url + '/fft_spectrum')
    # print("Response from /fft_spectrum route:", response.text)
    
    # response = requests.get(public_url + '/training')
    # print("Response from /training route:", response.text)
    
    # response = requests.get(public_url + '/model_predict')
    # print("Response from /model_predict route:", response.text)

    print("Flask server is running and ngrok tunnel is established.")