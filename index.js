const path = require('path');
const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');

// authenticate user
async function authorize() {
    const auth = await authenticate({
        keyfilePath: path.join(__dirname, 'credentials.json'),
        scopes: [
            'https://www.googleapis.com/auth/gmail.labels',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.send',
        ],
    });
    return auth;
}

let access_token;
let labelId;

// check if label exist
async function checkLabelExist(label) {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${access_token}`
        },
    })
    const data = await res.json();
    const labels = data['labels'];

    const l = labels.find((l) => l.name === label);

    return l ? l.id : '';
}

// create a label
async function createLabel(label) {
    const req = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + access_token, },
        body: JSON.stringify({
            name: label,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
        })
    });
    const res = await req.json();

    return res;
}


// get unread messages
async function getMessages() {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${access_token}`
        }
    }
    );
    const data = await response.json();
    const messages = data['messages'];

    return messages;
}

// get message with no prior replies
async function getMessagesWithoutPriorReplies(messageIds) {
    let singleThreadMsgs = []
    for (const message of messageIds) {
        const { id, threadId } = message;

        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/threads/' + threadId, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        })
        const data = await res.json();

        if (data.messages && data.messages.length == 1) {
            singleThreadMsgs.push(data.messages[0]);
        }
    }
    return singleThreadMsgs;
}

async function sendMail(messages) {
    for (const message of messages) {
try{
        const sender_headers = message.payload.headers;

        const sender = sender_headers.find((header) => header.name === 'From').value;
        const subject = sender_headers.find((header) => header.name === 'Subject').value;
        const message_id = sender_headers.find((header) => header.name === 'Message-ID').value;

        const replyPayload = {
            raw: btoa(
                `References: ${message_id}\r\n` +
                `In-Reply-To: ${message_id}\r\n` +
                `From: kshitij1209jain@gmail.com\r\n` +
                `To: ${sender}\r\n` +
                `Subject: Re: ${subject}\r\n\r\n` +
                `Currently I am on a LONGGGGGGG vacation.\nWill contact you soon`
            ),
            threadId: message['threadId']
        };

        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(replyPayload),
        });

        if (res.status === 200) {
            console.log(`Reply sent to : ${sender}.`);
        } else {
            console.error(`Cannot send reply to : ${sender}`);
        }
    }
    catch(e){
        console.log(e);
    }
    }
}

// add label to replied mails
async function addLabel(messages) {
    for (const message of messages) {
        const message_id = message['id'];

        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}/modify`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                addLabelIds: [
                    labelId
                ],
                removeLabelIds: [
                    'UNREAD'
                ]
            }),
        });
        const data = await res.json();

        if (res.status === 200) {
            console.log(`Assigned VACATION label to ${message_id} .`);
        } else {
            console.error(`Could not assign label id to : ${message_id}`);
        }
    }
}
//random interval of 45 to 120 sec
const getRandomSeconds = () => 1000 * (Math.floor(Math.random() * (120 - 45) + 46));

// main function
async function start(auth) {
    access_token = auth.credentials.access_token;
    let time = getRandomSeconds();

    setInterval(async () => {
        const labelStatus = await checkLabelExist('VACATION');
        if (labelStatus) {
            labelId = labelStatus;
        } else {
            const label = await createLabel('VACATION');
            labelId = label.id;
        }


        let messages = await getMessages();
        if (!messages) {
            console.log('No messages .');
        }
        else {
            messages = await getMessagesWithoutPriorReplies(messages);

            if (messages.length) {
                console.log('Total unread messages : ', messages.length);
                console.log('Starting to send reply ...\n');

                await sendMail(messages);
                await addLabel(messages);
            }
        }

        time = getRandomSeconds();
        console.log('time = ', (time/1000)+'sec', '\n\n')
    }, time)
}

authorize().then(start).catch((err) => console.log(err));
