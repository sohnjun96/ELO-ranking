from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
import streamlit as st
from datetime import datetime
import requests

slack_token = st.secrets["token"]
client = WebClient(token=slack_token)
slack_channel = "C087833T8K0"

def slack_send(msg):
    try:
        response = client.chat_postMessage(
            channel=slack_channel, #채널 id를 입력합니다.
            text=msg
        )
    except SlackApiError as e:
        assert e.response["error"]

# 파일 업로드하는 함수
def slack_upload(slack_file, comment):
    try:
        result = client.files_upload_v2(file=slack_file, channel = slack_channel, title=f'data_{datetime.now().date()}', initial_comment = comment)
        with open('.version', 'w') as file:
            file.write(comment)
        return True
    except:
        print("Error while saving")
        return False
        
# 최근 파일 다운로드 tmp.zip으로 저장
def file_read():
    response = client.conversations_history(
        channel=slack_channel, #채널 id를 입력합니다.
    )
    url = response['messages'][0]['files'][0]['url_private_download']

    with open('tmp.zip', "wb") as file:
        slack_file = requests.get(url,  headers={'Authorization': 'Bearer %s' % slack_token})
        file.write(slack_file.content)
    title = response['messages'][0]['files'][0]['title']
                                                
    return title
